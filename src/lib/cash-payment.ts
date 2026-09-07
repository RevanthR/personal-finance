import type { Prisma } from "@/generated/prisma/client";
import type { db } from "@/lib/db";
import { effectivePaid } from "@/lib/finance-utils";

type Tx = typeof db | Prisma.TransactionClient;

const round2 = (n: number) => Math.round(n * 100) / 100;

type EntryPaidShape = {
  amount: number;
  cashbackAmount: number | null;
  isPaid: boolean;
  paidAmount: number | null;
  paidViaCardTemplateId: string | null;
};

// Cash a recurring bill has actually cost. A bill settled via a card costs
// no cash of its own — that happens when the card's statement is paid.
const cashPaidOf = (e: EntryPaidShape) =>
  e.paidViaCardTemplateId ? 0 : effectivePaid(e);

/**
 * Append one CashPayment row for the change in an entry's cash-paid total
 * (positive on a payment, negative on an un-pay / reduction). Call inside
 * the same transaction as the MonthlyEntry update, passing its state before
 * and after. See src/lib/cash-balance.ts.
 */
export async function recordEntryCashDelta(
  tx: Tx,
  userId: string,
  entryId: string,
  before: EntryPaidShape,
  after: EntryPaidShape,
  paidOn: Date = new Date(),
): Promise<void> {
  const delta = round2(cashPaidOf(after) - cashPaidOf(before));
  if (delta === 0) return;
  await tx.cashPayment.create({
    data: { userId, monthlyEntryId: entryId, amount: delta, paidOn, note: delta < 0 ? "reversal" : null },
  });
}

/** Same, for a card statement's paidAmount moving from `before` to `after`. */
export async function recordCardCashDelta(
  tx: Tx,
  userId: string,
  cardStatementId: string,
  before: number,
  after: number,
  paidOn: Date = new Date(),
): Promise<void> {
  const delta = round2(after - before);
  if (delta === 0) return;
  await tx.cashPayment.create({
    data: { userId, cardStatementId, amount: delta, paidOn, note: delta < 0 ? "reversal" : null },
  });
}
