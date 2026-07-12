import { db } from "@/lib/db";
import { getGmailClientForUser } from "./client";
import { extractTransaction } from "./extract";
import { matchCard } from "./card-match";
import type { gmail_v1 } from "googleapis";
import type { ParsedTransactionPaymentMethod } from "@/generated/prisma/client";

// Coarse, cheap pre-filter run entirely inside Gmail's search. Narrows
// down to plausible bank/bill-aggregator emails (credit card, debit card,
// UPI) so the (rate-limited, per-call) Gemini extraction step only runs
// against likely candidates, not the whole inbox. Also excludes obvious
// marketing subjects (EMI offers, rewards, job alerts) that otherwise
// crowd out real alerts within the maxResults cap and waste Gemini quota.
const SEARCH_QUERY =
  'newer_than:7d (subject:(transaction OR spent OR debited OR credited OR alert OR payment OR upi OR statement OR bill OR billed OR "a/c") OR from:(alert OR alerts OR notification OR notifications OR bank OR onecard OR cred)) '
  + '-subject:(reward OR rewards OR EMI OR luxury OR deals OR podcast OR insights OR maintenance OR loan OR hiring OR job OR jobs OR "capital gains" OR "wealth insights" OR "under maintenance")';

const PAYMENT_METHOD_MAP: Record<string, ParsedTransactionPaymentMethod> = {
  creditCard: "CREDIT_CARD",
  upi: "UPI",
  debitCard: "DEBIT_CARD",
  other: "OTHER",
};

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

export async function syncGmailForUser(userId: string, onProgress?: ProgressCallback): Promise<SyncResult> {
  const gmail = await getGmailClientForUser(userId);
  if (!gmail) return { synced: 0, skipped: 0, failed: 0, error: "Gmail not connected" };

  const list = await gmail.users.messages.list({ userId: "me", q: SEARCH_QUERY, maxResults: 25 });
  const messages = list.data.messages ?? [];

  const cardRows = await db.creditCard.findMany({
    where: { userId, template: { isActive: true } },
    select: { templateId: true, bank: true, network: true, last4: true, template: { select: { name: true } } },
  });
  const cards = cardRows.map(c => ({ templateId: c.templateId, name: c.template.name, bank: c.bank, network: c.network, last4: c.last4 }));

  // Messages already inspected in a past sync — whether or not they turned
  // into a transaction — are skipped without ever re-fetching their body or
  // re-spending a Gemini call on them.
  const candidateIds = messages.map(m => m.id).filter((id): id is string => !!id);
  const seen = await db.gmailSeenMessage.findMany({
    where: { userId, gmailMessageId: { in: candidateIds } },
    select: { gmailMessageId: true },
  });
  const seenIds = new Set(seen.map(s => s.gmailMessageId));

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for (const id of candidateIds) {
    if (seenIds.has(id)) { skipped++; processed++; onProgress?.(processed, candidateIds.length); continue; }

    try {
      const full = await gmail.users.messages.get({ userId: "me", id, format: "full" });
      const text = extractPlainText(full.data.payload ?? undefined) || full.data.snippet || "";
      if (!text) { skipped++; continue; }

      const extracted = await extractTransaction(text);

      // Mark as inspected regardless of outcome — a "not a transaction"
      // result is still a completed inspection, not a transient failure,
      // so it must not be re-fetched/re-sent to Gemini next sync.
      await db.gmailSeenMessage.create({ data: { userId, gmailMessageId: id } });

      if (!extracted) { skipped++; continue; }

      const paymentMethod = PAYMENT_METHOD_MAP[extracted.paymentMethod ?? "other"] ?? "OTHER";
      const suggestedCcTemplateId = paymentMethod === "CREDIT_CARD"
        ? matchCard({ bank: extracted.bank, last4: extracted.last4 }, cards)
        : null;

      await db.parsedTransaction.create({
        data: {
          userId,
          gmailMessageId: id,
          bank: extracted.bank ?? "Unknown",
          amount: extracted.amount!,
          merchant: extracted.merchant,
          last4: extracted.last4,
          date: extracted.date && !isNaN(Date.parse(extracted.date)) ? new Date(extracted.date) : new Date(),
          rawSnippet: full.data.snippet ?? text.slice(0, 200),
          paymentMethod,
          suggestedCcTemplateId,
          suggestedSubcategory: extracted.subcategory,
        },
      });
      synced++;
    } catch (err) {
      // A transient failure (Gmail/Gemini timeout, network error) on one
      // message must not abort the rest of the batch — and deliberately
      // isn't marked "seen", so it's retried on the next sync.
      failed++;
      console.error(`[gmail-sync] failed on message ${id}:`, err instanceof Error ? err.message : err);
    } finally {
      processed++;
      onProgress?.(processed, candidateIds.length);
    }
  }

  await db.gmailConnection.update({ where: { userId }, data: { lastSyncAt: new Date() } });

  return { synced, skipped, failed };
}
