import { db } from "@/lib/db";

export type ExistingMatch = { id: string; name: string; amount: number; date: string };

const AMOUNT_EPSILON = 0.5;
const DATE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

// Best-effort match of parsed transactions against AdHocItems the user
// already entered manually — same date (+/-1 day) and near-identical
// amount. AdHocItem has no link back to the Gmail message it may
// correspond to, so this is a heuristic, not a certainty; the review UI
// always lets the user override it ("not the same — add anyway").
export async function findExistingMatches(
  userId: string,
  transactions: { id: string; date: Date; amount: number }[],
): Promise<Map<string, ExistingMatch>> {
  if (transactions.length === 0) return new Map();

  const times = transactions.map(t => t.date.getTime());
  const minDate = new Date(Math.min(...times) - DATE_TOLERANCE_MS);
  const maxDate = new Date(Math.max(...times) + DATE_TOLERANCE_MS);

  const candidates = await db.adHocItem.findMany({
    where: { month: { userId }, date: { gte: minDate, lte: maxDate } },
    select: { id: true, name: true, amount: true, date: true },
  });

  const result = new Map<string, ExistingMatch>();
  for (const t of transactions) {
    const match = candidates.find(c =>
      Math.abs(c.date.getTime() - t.date.getTime()) <= DATE_TOLERANCE_MS &&
      Math.abs(c.amount - t.amount) <= AMOUNT_EPSILON,
    );
    if (match) {
      result.set(t.id, { id: match.id, name: match.name, amount: match.amount, date: match.date.toISOString() });
    }
  }
  return result;
}

// The same real-world charge can be reported by two different senders —
// e.g. a bank's own transaction alert and a merchant's payment receipt
// (a GCP charge showed up as both an Axis Bank alert and a Google Payments
// email, same amount/date/card, different gmailMessageId). Neither has
// become an AdHocItem yet, so findExistingMatches above can't catch this —
// it only compares against already-approved entries. This compares pending
// parsed transactions against each other instead: same date (+/-1 day),
// same amount, and matching last4 when both have one (a much stronger
// signal than date+amount alone, since it ties them to the same physical
// card). Older (earlier createdAt) wins; later ones are flagged as the
// probable duplicate.
export function findParsedTransactionDuplicates(
  transactions: { id: string; date: Date; amount: number; last4: string | null; merchant: string | null; bank: string; createdAt: Date }[],
): Map<string, ExistingMatch> {
  const sorted = [...transactions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const result = new Map<string, ExistingMatch>();

  for (let i = 0; i < sorted.length; i++) {
    const later = sorted[i];
    const earlier = sorted.slice(0, i).find(e =>
      Math.abs(e.date.getTime() - later.date.getTime()) <= DATE_TOLERANCE_MS &&
      Math.abs(e.amount - later.amount) <= AMOUNT_EPSILON &&
      e.last4 && later.last4 && e.last4 === later.last4,
    );
    if (earlier) {
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
