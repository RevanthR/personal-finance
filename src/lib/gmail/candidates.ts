import type { gmail_v1 } from "googleapis";
import { runPool } from "./pool";

// Each metadata-only fetch below is fully independent (its own Gmail call,
// no shared state) — matches sync.ts's own concurrency for this kind of
// per-message I/O-bound work.
const CONCURRENCY = 4;

// Mirrors SEARCH_QUERY's subject/from keyword logic in sync.ts, for use
// against candidates discovered via history.list (item 5) — Gmail's own
// server-side `q:` search isn't available on that endpoint, so this is the
// client-side approximation applied after a cheap metadata-only fetch,
// before deciding whether a candidate is worth a full body fetch at all.
const SUBJECT_KEYWORDS = ["transaction", "spent", "debited", "credited", "alert", "payment", "upi", "statement", "bill", "billed", "a/c"];
const FROM_KEYWORDS = ["alert", "alerts", "notification", "notifications", "bank", "onecard", "cred"];
const EXCLUDE_SUBJECT_KEYWORDS = ["reward", "rewards", "emi", "luxury", "deals", "podcast", "insights", "maintenance", "loan", "hiring", "job", "jobs", "capital gains", "wealth insights", "under maintenance"];

export function matchesKeywordFilter(subject: string, from: string): boolean {
  const s = subject.toLowerCase();
  const f = from.toLowerCase();
  if (EXCLUDE_SUBJECT_KEYWORDS.some(k => s.includes(k))) return false;
  return SUBJECT_KEYWORDS.some(k => s.includes(k)) || FROM_KEYWORDS.some(k => f.includes(k));
}

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export interface HistoryCandidates {
  candidateIds: string[];
  // The mailbox's historyId as of this exact query — NOT "now" (that's a
  // different, later point in time than what was actually just fetched).
  // The caller must persist this value verbatim as the next cursor, rather
  // than making a separate getProfile() call afterward: a message that
  // lands in the gap between "history.list ran" and "getProfile ran" would
  // otherwise get silently stepped over forever, since incremental sync
  // only ever looks forward from the stored cursor.
  historyId: string | null;
}

// Every mailbox change since `startHistoryId` — new messages only (not
// reads/labels/deletes), each checked against the same keyword filter the
// full search applies server-side, via a cheap metadata-only fetch (no
// body) before it's counted as a real candidate. Throws on Gmail's own
// "historyId too old" error so the caller can fall back to a full search;
// never silently returns a partial/wrong result.
export async function listCandidatesViaHistory(
  gmail: gmail_v1.Gmail,
  startHistoryId: string,
): Promise<HistoryCandidates> {
  const messageIds = new Set<string>();
  let pageToken: string | undefined;
  let historyId: string | null = null;

  do {
    const { data } = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
      pageToken,
    });
    for (const h of data.history ?? []) {
      for (const added of h.messagesAdded ?? []) {
        if (added.message?.id) messageIds.add(added.message.id);
      }
    }
    // Last page wins — Gmail's own docs describe this as "the mailbox's
    // current history record" as of this response, so the final page's
    // value is the correct one to advance the cursor to.
    if (data.historyId) historyId = data.historyId;
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  if (messageIds.size === 0) return { candidateIds: [], historyId };

  // Fetched concurrently (was sequential) — each call is independent, and
  // order doesn't matter here: the result just collects into a Set, and
  // sync.ts's own downstream candidate handling doesn't care about order
  // either.
  const candidates = new Set<string>();
  await runPool(Array.from(messageIds), CONCURRENCY, async (id) => {
    const { data } = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["Subject", "From"],
    });
    const subject = headerValue(data.payload?.headers, "Subject");
    const from = headerValue(data.payload?.headers, "From");
    if (matchesKeywordFilter(subject, from)) candidates.add(id);
  });
  return { candidateIds: [...candidates], historyId };
}

export async function listCandidatesViaSearch(gmail: gmail_v1.Gmail, query: string): Promise<string[]> {
  const { data } = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 25 });
  return (data.messages ?? []).map(m => m.id).filter((id): id is string => !!id);
}

export function extractSenderEmail(headers: gmail_v1.Schema$MessagePartHeader[] | undefined): string | null {
  const from = headerValue(headers, "From");
  if (!from) return null;
  const angleMatch = from.match(/<([^>]+)>/);
  return (angleMatch ? angleMatch[1] : from).trim().toLowerCase() || null;
}
