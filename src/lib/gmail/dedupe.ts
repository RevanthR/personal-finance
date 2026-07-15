import { db } from "@/lib/db";

export type ExistingMatch = { id: string; name: string; amount: number; date: string };

const AMOUNT_EPSILON = 0.5;
const MERCHANT_SIMILARITY_THRESHOLD = 0.4;
// A millisecond-based tolerance window used to sound "the same charge" (a
// bank alert and a merchant receipt for one purchase), but it also made a
// genuinely new same-merchant, same-amount purchase on the *next* day (the
// same ₹350 coffee bought two days running) look like the exact same
// charge. Comparing actual IST calendar day instead fixes that at the
// source: two purchases really are the same day, or they aren't.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function istDay(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
function sameDay(a: Date, b: Date): boolean {
  return istDay(a) === istDay(b);
}

function normalizeTokens(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
}

// Containment-style overlap — divides by the SMALLER token set, not the
// larger. Merchant names are often typed as a short abbreviation on one
// side ("Coffee") against a fuller extracted name on the other ("TOOPS
// COFFEE PVT LTD"); dividing by the larger set (plain Jaccard) would
// unfairly punish a full match of the shorter name's tokens.
function merchantSimilarity(a: string, b: string): number {
  const ta = normalizeTokens(a);
  const tb = normalizeTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.min(ta.size, tb.size);
}

// Missing name on either side doesn't block a match — falls through to
// date+amount alone — since AdHocItem.name is free text and can be
// anything the user typed.
function merchantsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return true;
  return merchantSimilarity(a, b) >= MERCHANT_SIMILARITY_THRESHOLD;
}

// Best-effort match of parsed transactions against AdHocItems the user
// already entered manually: same IST calendar day, near-identical amount,
// and a fuzzy merchant-name match. AdHocItem has no link back to the Gmail
// message it may correspond to, so this is a heuristic, not a certainty;
// the review UI always lets the user override it ("not the same, add
// anyway").
//
// Matching is 1:1: once an existing AdHocItem is claimed as the match for
// one pending transaction, it's removed from the pool so it can't also
// match a second, third, etc. Without this, a single real recurring
// purchase (e.g. the same ₹350 coffee bought two days running) would let
// the first day's entry "absorb" every later day's genuinely separate
// purchase forever, since nothing tracked that the match was already used.
export async function findExistingMatches(
  userId: string,
  transactions: { id: string; date: Date; amount: number; merchant?: string | null }[],
): Promise<Map<string, ExistingMatch>> {
  if (transactions.length === 0) return new Map();

  // A day either side is enough slack for the IST-day comparison below to
  // still have same-day candidates in range regardless of which side of
  // midnight either date was stored on.
  const times = transactions.map(t => t.date.getTime());
  const minDate = new Date(Math.min(...times) - 24 * 60 * 60 * 1000);
  const maxDate = new Date(Math.max(...times) + 24 * 60 * 60 * 1000);

  const candidates = await db.adHocItem.findMany({
    where: { month: { userId }, date: { gte: minDate, lte: maxDate } },
    select: { id: true, name: true, amount: true, date: true },
  });

  const usedCandidateIds = new Set<string>();
  const result = new Map<string, ExistingMatch>();
  // Earliest pending transaction gets first claim on a given existing entry.
  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const t of sorted) {
    const match = candidates.find(c =>
      !usedCandidateIds.has(c.id) &&
      sameDay(c.date, t.date) &&
      Math.abs(c.amount - t.amount) <= AMOUNT_EPSILON &&
      merchantsMatch(t.merchant, c.name),
    );
    if (match) {
      usedCandidateIds.add(match.id);
      result.set(t.id, { id: match.id, name: match.name, amount: match.amount, date: match.date.toISOString() });
    }
  }
  return result;
}

// The same real-world charge can be reported by two different senders,
// e.g. a bank's own transaction alert and a merchant's payment receipt
// (a GCP charge showed up as both an Axis Bank alert and a Google Payments
// email, same amount/date/card, different gmailMessageId). Neither has
// become an AdHocItem yet, so findExistingMatches above can't catch this;
// it only compares against already-approved entries. This compares pending
// parsed transactions against each other instead: same IST calendar day,
// same amount, matching last4 when both have one, and a fuzzy merchant
// match. Older (earlier createdAt) wins; later ones are flagged as the
// probable duplicate, but same as above, 1:1 only, so a third or fourth
// genuinely separate same-merchant purchase doesn't also get absorbed by
// the first one.
export function findParsedTransactionDuplicates(
  transactions: { id: string; date: Date; amount: number; last4: string | null; merchant: string | null; bank: string; createdAt: Date }[],
): Map<string, ExistingMatch> {
  const sorted = [...transactions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const usedIds = new Set<string>();
  const result = new Map<string, ExistingMatch>();

  for (let i = 0; i < sorted.length; i++) {
    const later = sorted[i];
    const earlier = sorted.slice(0, i).find(e =>
      !usedIds.has(e.id) &&
      sameDay(e.date, later.date) &&
      Math.abs(e.amount - later.amount) <= AMOUNT_EPSILON &&
      e.last4 && later.last4 && e.last4 === later.last4 &&
      merchantsMatch(e.merchant, later.merchant),
    );
    if (earlier) {
      usedIds.add(earlier.id);
      result.set(later.id, {
        id: earlier.id,
        name: earlier.merchant ?? earlier.bank,
        amount: earlier.amount,
        date: earlier.date.toISOString(),
      });
    }
  }
  return result;
}
