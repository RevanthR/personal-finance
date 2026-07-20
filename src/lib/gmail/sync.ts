import { db } from "@/lib/db";
import { getGmailClientForUser } from "./client";
import { extractTransaction, extractTransactionsBatch, MODEL, type ExtractedTransaction } from "./extract";
import { logGeminiCall } from "./gemini-usage";
import { matchCard } from "./card-match";
import { getInrRate } from "./fx-rate";
import { sendPushToUser } from "@/lib/push";
import { hasAmountSignal } from "./amount-signal";
import { tryKnownTemplate } from "./known-templates";
import { listCandidatesViaHistory, listCandidatesViaSearch, extractSenderEmail } from "./candidates";
import type { gmail_v1 } from "googleapis";
import type { ParsedTransactionPaymentMethod, ParsedTransactionType } from "@/generated/prisma/client";

// Coarse, cheap pre-filter run entirely inside Gmail's search. Narrows
// down to plausible bank/bill-aggregator emails (credit card, debit card,
// UPI) so the (rate-limited, per-call) Gemini extraction step only runs
// against likely candidates, not the whole inbox. Also excludes obvious
// marketing subjects (EMI offers, rewards, job alerts) that otherwise
// crowd out real alerts within the maxResults cap and waste Gemini quota.
// The category exclusions are free — Gmail already auto-buckets
// Promotions/Social mail, so this drops a lot of noise before anything is
// even fetched, let alone billed.
const SEARCH_QUERY =
  'newer_than:7d (subject:(transaction OR spent OR debited OR credited OR alert OR payment OR upi OR statement OR bill OR billed OR "a/c") OR from:(alert OR alerts OR notification OR notifications OR bank OR onecard OR cred)) '
  + '-subject:(reward OR rewards OR EMI OR luxury OR deals OR podcast OR insights OR maintenance OR loan OR hiring OR job OR jobs OR "capital gains" OR "wealth insights" OR "under maintenance") '
  + '-category:promotions -category:social';

const PAYMENT_METHOD_MAP: Record<string, ParsedTransactionPaymentMethod> = {
  creditCard: "CREDIT_CARD",
  upi: "UPI",
  debitCard: "DEBIT_CARD",
  other: "OTHER",
};

const TRANSACTION_TYPE_MAP: Record<string, ParsedTransactionType> = {
  debit: "DEBIT",
  credit: "CREDIT",
  refund: "REFUND",
};

// Sender-reputation gate: a sender with this many *consecutive*
// non-transaction results is skipped before ever reaching Gemini. One in
// every PROBE_INTERVAL is still let through as a probe even once blocked,
// so a sender that starts sending real alerts later doesn't stay locked
// out forever — a real transaction from them resets the streak to 0.
const REPUTATION_SKIP_THRESHOLD = 3;
const REPUTATION_PROBE_INTERVAL = 20;

function isReputationBlocked(rep: { notTxnStreak: number; totalSeen: number } | null): boolean {
  if (!rep || rep.notTxnStreak < REPUTATION_SKIP_THRESHOLD) return false;
  return rep.totalSeen % REPUTATION_PROBE_INTERVAL !== 0;
}

// Sent once a message's classification is known (transaction or not),
// regardless of whether that came from a known template, a solo Gemini
// call, or a batched one — keeps the streak accurate no matter which path
// produced the answer.
async function recordReputation(userId: string, senderEmail: string | null, wasTransaction: boolean): Promise<void> {
  if (!senderEmail) return;
  await db.gmailSenderReputation.upsert({
    where: { userId_senderEmail: { userId, senderEmail } },
    create: {
      userId,
      senderEmail,
      totalSeen: 1,
      totalTxn: wasTransaction ? 1 : 0,
      notTxnStreak: wasTransaction ? 0 : 1,
    },
    update: {
      totalSeen: { increment: 1 },
      totalTxn: wasTransaction ? { increment: 1 } : undefined,
      notTxnStreak: wasTransaction ? 0 : { increment: 1 },
    },
  });
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64").toString("utf-8");
}

function extractByMime(payload: gmail_v1.Schema$MessagePart | undefined, mimeType: string): string {
  if (!payload) return "";
  if (payload.mimeType === mimeType && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractByMime(part, mimeType);
      if (text) return text;
    }
  }
  return "";
}

// Some bank templates ship a broken plain-text fallback (seen in the wild:
// a Federal Bank/OneCard email whose text/plain part was literally the
// string "null") while the real content sits in the HTML part right next
// to it. Picking "whichever part is found first" trusts that broken part.
// Instead, extract both and take whichever has more actual substance.
function extractPlainText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  const html = extractByMime(payload, "text/html");
  const htmlText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const plainText = extractByMime(payload, "text/plain").trim();
  return htmlText.length > plainText.length ? htmlText : plainText;
}

type SyncResult = { synced: number; skipped: number; failed: number; error?: string };
type ProgressCallback = (processed: number, total: number) => void;

// How many messages to process at once. Each message is fully independent
// (its own Gmail fetch, and DB rows) so this is safe to run concurrently —
// no shared mutable state besides the plain counters below, and JS's
// single-threaded event loop makes a bare `counter++` safe across
// concurrent async work as long as no `await` splits the read and write.
const CONCURRENCY = 4;

// A single Gemini call handles at most this many emails at once — keeps
// the combined prompt and the array-shaped response small enough to stay
// reliable, and bounds how much work a single failed call (falling back
// to individual calls) has to redo.
const MAX_BATCH_SIZE = 8;

// Dependency-free worker pool: each worker pulls the next index off a
// shared cursor until the list is exhausted. No ordering guarantee across
// items, which is fine — onProgress only reports a count, not identity.
async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
}

// Bank alert emails only ever show the foreign-currency amount, the actual
// INR-converted figure (with the bank's forex markup) is only known after
// settlement, a day or two later. Resolves the best available INR estimate
// in priority order: bank-stated conversion > live rate > Gemini's own
// rough estimate > raw number as a last resort (today's old behavior).
async function resolveInrAmount(
  extracted: ExtractedTransaction,
): Promise<{ amount: number; originalCurrency: string | null; originalAmount: number | null }> {
  const currency = (extracted.currency ?? "INR").toUpperCase();
  const rawAmount = extracted.amount!;

  if (currency === "INR") {
    return { amount: rawAmount, originalCurrency: null, originalAmount: null };
  }

  if (extracted.convertedInrAmount) {
    return { amount: extracted.convertedInrAmount, originalCurrency: currency, originalAmount: rawAmount };
  }

  const liveRate = await getInrRate(currency);
  if (liveRate) {
    return { amount: Math.round(rawAmount * liveRate * 100) / 100, originalCurrency: currency, originalAmount: rawAmount };
  }

  if (extracted.approxInrRate) {
    return { amount: Math.round(rawAmount * extracted.approxInrRate * 100) / 100, originalCurrency: currency, originalAmount: rawAmount };
  }

  // Every conversion signal failed — fall back to the raw number rather
  // than dropping the transaction. Still tagged with originalCurrency so
  // the review screen flags it as unconverted instead of showing it as a
  // confident INR figure.
  return { amount: rawAmount, originalCurrency: currency, originalAmount: rawAmount };
}

// Everything finalize() needs about a message — deliberately just the
// plain fields, not a Gmail API response shape, so phase 1 (a real fetch)
// and phase 2 (already-fetched candidates waiting on Gemini) can both
// produce it the same way.
type CandidateInfo = {
  id: string;
  text: string;
  senderEmail: string | null;
  internalDate: string | null | undefined;
  snippet: string | null | undefined;
};

export async function syncGmailForUser(userId: string, onProgress?: ProgressCallback): Promise<SyncResult> {
  const gmailClient = await getGmailClientForUser(userId);
  if (!gmailClient) return { synced: 0, skipped: 0, failed: 0, error: "Gmail not connected" };
  const gmail = gmailClient; // non-null, closed over below

  const conn = await db.gmailConnection.findUnique({ where: { userId }, select: { historyId: true } });

  // Incremental fetch when we have a cursor — only what changed since
  // last check, instead of re-searching the whole rolling 7-day window on
  // every trigger. Falls back to the full search on any failure (most
  // commonly Gmail's own "historyId too old" error once the account's
  // history retention window has passed), so a stale/invalid cursor never
  // just silently misses new mail.
  let candidateIds: string[];
  if (conn?.historyId) {
    try {
      candidateIds = await listCandidatesViaHistory(gmail, conn.historyId);
    } catch (err) {
      console.error(`[gmail-sync] history.list failed for user ${userId}, falling back to full search:`, err instanceof Error ? err.message : err);
      candidateIds = await listCandidatesViaSearch(gmail, SEARCH_QUERY);
    }
  } else {
    candidateIds = await listCandidatesViaSearch(gmail, SEARCH_QUERY);
  }

  // Advance the cursor for next time regardless of which path just ran —
  // best-effort; a failure here just means the next sync falls back to a
  // full search too, not a lost transaction.
  try {
    const profile = await gmail.users.getProfile({ userId: "me" });
    if (profile.data.historyId) {
      await db.gmailConnection.update({ where: { userId }, data: { historyId: profile.data.historyId } });
    }
  } catch (err) {
    console.error(`[gmail-sync] failed to refresh historyId for user ${userId}:`, err instanceof Error ? err.message : err);
  }

  const cardRows = await db.creditCard.findMany({
    where: { userId, template: { isActive: true } },
    select: { templateId: true, bank: true, network: true, last4: true, template: { select: { name: true } } },
  });
  const cards = cardRows.map(c => ({ templateId: c.templateId, name: c.template.name, bank: c.bank, network: c.network, last4: c.last4 }));

  // Messages already inspected in a past sync — whether or not they turned
  // into a transaction — are skipped without ever re-fetching their body or
  // re-spending a Gemini call on them.
  const seen = await db.gmailSeenMessage.findMany({
    where: { userId, gmailMessageId: { in: candidateIds } },
    select: { gmailMessageId: true },
  });
  const seenIds = new Set(seen.map(s => s.gmailMessageId));
  const unseenIds = candidateIds.filter(id => !seenIds.has(id));

  let synced = 0;
  let skipped = candidateIds.length - unseenIds.length;
  let failed = 0;
  let processed = skipped;
  const total = candidateIds.length;
  const newlySynced: { merchant: string | null; bank: string; amount: number }[] = [];
  onProgress?.(processed, total);

  // finalize() is shared by every extraction source (known template, solo
  // Gemini call, or a batched one) — resolves the INR amount, writes the
  // ParsedTransaction (or just marks seen for a confirmed non-transaction),
  // and updates sender reputation either way. Does not advance
  // processed/onProgress itself — callers do, since phase 1's inline path
  // and phase 2's deferred path advance at different points.
  async function finalize(c: CandidateInfo, extracted: ExtractedTransaction | null): Promise<void> {
    if (!extracted) {
      await db.gmailSeenMessage.create({ data: { userId, gmailMessageId: c.id } });
      await recordReputation(userId, c.senderEmail, false);
      skipped++;
      return;
    }

    try {
      const paymentMethod = PAYMENT_METHOD_MAP[extracted.paymentMethod ?? "other"] ?? "OTHER";
      const transactionType = TRANSACTION_TYPE_MAP[extracted.transactionType ?? "debit"] ?? "DEBIT";
      const suggestedCcTemplateId = paymentMethod === "CREDIT_CARD"
        ? matchCard({ bank: extracted.bank, last4: extracted.last4 }, cards)
        : null;
      const { amount, originalCurrency, originalAmount } = await resolveInrAmount(extracted);

      const emailReceivedAt = c.internalDate ? new Date(Number(c.internalDate)) : null;

      await db.parsedTransaction.create({
        data: {
          userId,
          gmailMessageId: c.id,
          bank: extracted.bank ?? "Unknown",
          amount,
          originalCurrency,
          originalAmount,
          merchant: extracted.merchant,
          last4: extracted.last4,
          date: extracted.date && !isNaN(Date.parse(extracted.date)) ? new Date(extracted.date) : (emailReceivedAt ?? new Date()),
          transactionTime: extracted.transactionTime,
          emailReceivedAt,
          rawSnippet: c.snippet ?? c.text.slice(0, 200),
          paymentMethod,
          transactionType,
          suggestedCcTemplateId,
          suggestedSubcategory: extracted.subcategory,
        },
      });
      // Only mark seen once the transaction is actually persisted — if the
      // write above throws, this is skipped and the catch block below
      // deliberately leaves it unseen so it's retried next sync, instead of
      // being silently and permanently lost.
      await db.gmailSeenMessage.create({ data: { userId, gmailMessageId: c.id } });
      await recordReputation(userId, c.senderEmail, true);
      synced++;
      newlySynced.push({ merchant: extracted.merchant, bank: extracted.bank ?? "Unknown", amount });
    } catch (err) {
      failed++;
      console.error(`[gmail-sync] failed finalizing message ${c.id}:`, err instanceof Error ? err.message : err);
    }
  }

  // --- Phase 1: fetch + free local classification (concurrent, I/O-bound) ---
  // Every message either resolves right here (skipped, or extracted via a
  // known template with no Gemini involved) or lands in needsGemini for
  // phase 2.
  const needsGemini: CandidateInfo[] = [];

  async function fetchAndClassify(id: string): Promise<void> {
    try {
      const full = await gmail.users.messages.get({ userId: "me", id, format: "full" });
      const text = extractPlainText(full.data.payload ?? undefined) || full.data.snippet || "";
      if (!text) { skipped++; processed++; onProgress?.(processed, total); return; }

      const candidate: CandidateInfo = {
        id,
        text,
        senderEmail: extractSenderEmail(full.data.payload?.headers ?? undefined),
        internalDate: full.data.internalDate,
        snippet: full.data.snippet,
      };

      const rep = candidate.senderEmail
        ? await db.gmailSenderReputation.findUnique({ where: { userId_senderEmail: { userId, senderEmail: candidate.senderEmail } } })
        : null;
      if (isReputationBlocked(rep)) {
        await db.gmailSeenMessage.create({ data: { userId, gmailMessageId: id } });
        // The probe check below is `totalSeen % PROBE_INTERVAL === 0` — if
        // this counter stopped advancing the moment a sender got blocked,
        // that check would freeze at whatever remainder it had when
        // blocking started and could never land on a multiple of the
        // interval again, silently turning "1-in-20 still gets checked"
        // into "blocked forever". Keeping it incrementing here is what
        // actually lets the probe eventually fire.
        await db.gmailSenderReputation.update({
          where: { userId_senderEmail: { userId, senderEmail: candidate.senderEmail! } },
          data: { totalSeen: { increment: 1 } },
        });
        skipped++;
        processed++;
        onProgress?.(processed, total);
        return;
      }

      if (!hasAmountSignal(text)) {
        await finalize(candidate, null);
        processed++;
        onProgress?.(processed, total);
        return;
      }

      const templateResult = tryKnownTemplate(text);
      if (templateResult) {
        await finalize(candidate, templateResult);
        processed++;
        onProgress?.(processed, total);
        return;
      }

      needsGemini.push(candidate);
      // processed/onProgress advance in phase 2 for these — not done yet.
    } catch (err) {
      failed++;
      processed++;
      onProgress?.(processed, total);
      console.error(`[gmail-sync] fetch/classify failed on message ${id}:`, err instanceof Error ? err.message : err);
    }
  }

  await runPool(unseenIds, CONCURRENCY, fetchAndClassify);

  // --- Phase 2: Gemini for whatever phase 1 couldn't resolve for free.
  // A run with exactly one candidate just calls the single-email path,
  // unchanged from before — batching only kicks in when there's genuinely
  // more than one already-fetched candidate in hand, so it never delays a
  // lone new transaction waiting to accumulate a batch. ---
  async function classifyIndividually(c: CandidateInfo): Promise<void> {
    let extracted: ExtractedTransaction | null = null;
    try {
      const { result, usage } = await extractTransaction(c.text);
      extracted = result;
      if (usage) await logGeminiCall(userId, { model: MODEL, batchSize: 1, ...usage });
    } catch (err) {
      failed++;
      processed++;
      onProgress?.(processed, total);
      console.error(`[gmail-sync] Gemini extraction failed on message ${c.id}:`, err instanceof Error ? err.message : err);
      return;
    }
    await finalize(c, extracted);
    processed++;
    onProgress?.(processed, total);
  }

  if (needsGemini.length === 1) {
    await classifyIndividually(needsGemini[0]);
  } else if (needsGemini.length > 1) {
    for (let i = 0; i < needsGemini.length; i += MAX_BATCH_SIZE) {
      const chunk = needsGemini.slice(i, i + MAX_BATCH_SIZE);
      let results: (ExtractedTransaction | null)[] | null = null;
      try {
        const batchResponse = await extractTransactionsBatch(chunk.map(c => c.text));
        results = batchResponse.results;
        if (batchResponse.usage) await logGeminiCall(userId, { model: MODEL, batchSize: chunk.length, ...batchResponse.usage });
      } catch (err) {
        // Never let a batch failure (malformed response, length mismatch,
        // network error) lose these candidates — fall back to individual
        // calls for exactly this chunk instead of failing it outright.
        console.error(`[gmail-sync] batch extraction failed, falling back to individual calls:`, err instanceof Error ? err.message : err);
      }

      if (results) {
        for (let j = 0; j < chunk.length; j++) {
          await finalize(chunk[j], results[j]);
          processed++;
          onProgress?.(processed, total);
        }
      } else {
        for (const c of chunk) {
          await classifyIndividually(c);
        }
      }
    }
  }

  await db.gmailConnection.update({ where: { userId }, data: { lastSyncAt: new Date() } });

  // One summary notification per sync run, not one per transaction — a
  // single real-world purchase can show up as several separate bank
  // emails (seen firsthand: one charge, three alert emails), which would
  // otherwise fire a burst of near-identical notifications.
  if (newlySynced.length > 0) {
    const payload = newlySynced.length === 1
      ? {
          title: "New transaction detected",
          body: `₹${newlySynced[0].amount.toLocaleString("en-IN")} at ${newlySynced[0].merchant ?? newlySynced[0].bank}`,
          url: "/imports",
        }
      : {
          title: "New transactions synced",
          body: `${newlySynced.length} new transactions synced`,
          url: "/imports",
        };
    try {
      await sendPushToUser(userId, payload);
    } catch (err) {
      console.error(`[gmail-sync] push notification failed for user ${userId}:`, err instanceof Error ? err.message : err);
    }
  }

  return { synced, skipped, failed };
}
