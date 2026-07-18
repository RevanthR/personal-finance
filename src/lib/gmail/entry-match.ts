import { db } from "@/lib/db";
import { tokenOverlapScore } from "./text-similarity";

export type EntryMatch = {
  kind: "cc" | "recurring";
  entryId: string;
  templateId: string;
  templateName: string;
  owed: number;
  alreadyPaid: number;
};

// "Bank", "card", "credit" show up in nearly every card's name/bank/network
// text ("Axis Bank Credit Card", "One Card ... Bank ... Visa") — left in,
// they inflate overlap between UNRELATED cards just as much as a real
// match, which is exactly backwards for a check whose whole job is "which
// specific bank/card is this." Stripped so only the identifying words
// (the bank name, a card nickname) drive the score.
const STOPWORDS = new Set(["bank", "banks", "card", "cards", "credit", "cc", "ltd", "limited", "the", "of", "payment", "bill", "and", "co"]);

// Containment-style overlap (divide by the SMALLER token set) — a UPI
// payee string ("Axis Bank Credit Card") and a user-typed template name
// are rarely the same length, so plain Jaccard would unfairly punish a
// full match of the shorter one's tokens. Same reasoning as dedupe.ts.
function nameSimilarity(a: string, b: string): number {
  return tokenOverlapScore(a, b, { mode: "containment", stopwords: STOPWORDS });
}

const NAME_SIMILARITY_THRESHOLD = 0.4;
const AMOUNT_EPSILON = 0.5;

type PendingTx = {
  id: string;
  date: Date;
  amount: number;
  merchant: string | null;
  bank: string;
  paymentMethod: string;
};

// Best-effort recognition that a debit is actually settling an existing
// bill (a credit card payment, a loan EMI, rent, insurance, any recurring
// item) rather than a new purchase — without asking the Gemini extractor
// to classify "purpose" at all. The merchant/bank text and amount already
// extracted today are enough of a signal on their own:
//
//   - No genuine purchase is ever "from Axis Bank Credit Card" — that
//     merchant text only shows up on a bill-payment alert. So for any
//     transaction NOT paid using the card itself (paymentMethod !=
//     CREDIT_CARD), a name match against one of the user's own CC
//     templates is a near-certain bill-payment signal.
//   - A recurring bill (rent, EMI, insurance) paid to an individual payee
//     often shares zero vocabulary with however the user named the
//     template ("House Rent" vs "Ramesh Kumar"), so an exact amount match
//     against a specific unpaid entry in the right month carries just as
//     much weight as a name match — coincidentally matching an unpaid
//     bill's exact rupee amount, in the month it's due, is unlikely.
//
// Every match here is only ever a suggestion the review UI shows for
// confirmation — approving it pays down the matched entry instead of
// creating a new AdHocItem; declining it falls through to today's normal
// "add as new expense" flow. Matches are 1:1 per batch: once an entry is
// claimed by one pending transaction, it's removed from the pool so a
// second unrelated transaction can't also claim it.
export async function findEntryMatches(userId: string, transactions: PendingTx[]): Promise<Map<string, EntryMatch>> {
  if (transactions.length === 0) return new Map();

  const monthKeys = new Set(transactions.map(t => `${t.date.getFullYear()}-${t.date.getMonth() + 1}`));
  const monthPairs = [...monthKeys].map(k => {
    const [year, month] = k.split("-").map(Number);
    return { year, month };
  });

  const months = await db.month.findMany({
    where: { userId, OR: monthPairs.map(p => ({ year: p.year, month: p.month })) },
    include: {
      entries: {
        where: { isPaid: false },
        include: { template: { select: { name: true } } },
      },
    },
  });

  const ccCards = await db.creditCard.findMany({
    where: { userId, template: { isActive: true } },
    select: { templateId: true, bank: true, network: true },
  });
  const ccTemplateIds = new Set(ccCards.map(c => c.templateId));

  const usedEntryIds = new Set<string>();
  const result = new Map<string, EntryMatch>();

  for (const t of transactions) {
    const month = months.find(m => m.year === t.date.getFullYear() && m.month === t.date.getMonth() + 1);
    if (!month) continue;

    const searchText = t.merchant ?? t.bank;
    const candidates = month.entries.filter(e => !usedEntryIds.has(e.id));

    // A swipe alert's merchant is the shop, never the card issuer's own
    // name — so a card-issuer name match only makes sense here when the
    // charge wasn't made using the card itself.
    if (t.paymentMethod !== "CREDIT_CARD") {
      let best: { entry: typeof candidates[number]; score: number } | null = null;
      let tied = false;
      for (const entry of candidates) {
        if (!ccTemplateIds.has(entry.templateId)) continue;
        const card = ccCards.find(c => c.templateId === entry.templateId);
        const cardText = `${entry.template.name} ${card?.bank ?? ""} ${card?.network ?? ""}`;
        const outstanding = entry.amount - (entry.cashbackAmount ?? 0) - (entry.paidAmount ?? 0);
        // No amount ceiling here, unlike the recurring path below — a CC
        // bill payment can legitimately overpay (rounding up, paying ahead
        // of next month's charges), and the name/bank match against one of
        // the user's own cards is specific enough on its own that this
        // doesn't risk the false positives an unbounded amount-only match
        // would (see the recurring-entry loop's amount ceiling).
        if (outstanding <= 0) continue;
        const score = nameSimilarity(searchText, cardText);
        if (score < NAME_SIMILARITY_THRESHOLD) continue;
        if (!best || score > best.score) { best = { entry, score }; tied = false; }
        else if (score === best.score) { tied = true; }
      }
      // An ambiguous tie between two different cards (e.g. both score
      // purely on generic overlap) is worse than no suggestion at all —
      // silently paying down the wrong card's bill is real harm.
      if (best && tied) best = null;
      if (best) {
        usedEntryIds.add(best.entry.id);
        result.set(t.id, {
          kind: "cc",
          entryId: best.entry.id,
          templateId: best.entry.templateId,
          templateName: best.entry.template.name,
          owed: best.entry.amount - (best.entry.cashbackAmount ?? 0),
          alreadyPaid: best.entry.paidAmount ?? 0,
        });
        continue;
      }
    }

    let best: { entry: typeof candidates[number]; score: number } | null = null;
    let tied = false;
    for (const entry of candidates) {
      if (ccTemplateIds.has(entry.templateId)) continue; // handled above
      const outstanding = entry.amount - (entry.cashbackAmount ?? 0) - (entry.paidAmount ?? 0);
      if (outstanding <= 0 || t.amount > outstanding + AMOUNT_EPSILON) continue;
      const nameScore = nameSimilarity(searchText, entry.template.name);
      const isFullAmountMatch = Math.abs(t.amount - outstanding) <= AMOUNT_EPSILON;
      if (nameScore < NAME_SIMILARITY_THRESHOLD && !isFullAmountMatch) continue;
      const score = isFullAmountMatch ? Math.max(nameScore, 0.5) : nameScore;
      if (!best || score > best.score) { best = { entry, score }; tied = false; }
      else if (score === best.score) { tied = true; }
    }
    if (best && tied) best = null;
    if (best) {
      usedEntryIds.add(best.entry.id);
      result.set(t.id, {
        kind: "recurring",
        entryId: best.entry.id,
        templateId: best.entry.templateId,
        templateName: best.entry.template.name,
        owed: best.entry.amount - (best.entry.cashbackAmount ?? 0),
        alreadyPaid: best.entry.paidAmount ?? 0,
      });
    }
  }

  return result;
}
