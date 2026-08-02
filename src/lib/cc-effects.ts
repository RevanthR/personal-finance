import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { isZeroCCBalance, isPreCloseDate } from "@/lib/finance-utils";
import { prevMonthYear } from "@/lib/utils";

export type EntryFields = { id: string; amount: number; statementAmount: number | null; billedAmount: number | null };

// Every function here takes the DB client as its first argument — either
// the plain singleton (`db`) or a `Prisma.TransactionClient` — so callers
// that need the AdHocItem write and this CC-effect write to succeed or
// fail together can pass a `tx` from `db.$transaction(...)` instead of two
// separate, independently-committing round trips.
type DbClient = typeof db | Prisma.TransactionClient;

// Recompute statementAmount for a CC card from ALL current post-close
// adHocItems linked to it. Idempotent and self-healing regardless of past
// accumulation bugs — always re-sums live rows rather than adjusting deltas.
async function recomputeStatementAmount(
  client: DbClient,
  entryId: string,
  monthId: string,
  ccTemplateId: string,
  statementDay: number | null,
): Promise<EntryFields> {
  const cardItems = await client.adHocItem.findMany({
    where: { monthId, type: "EXPENSE", ccTemplateId },
    select: { amount: true, date: true, isCredit: true },
  });

  // Credits (refunds/reversals against this card, isCredit rows) net OUT of
  // the post-close total instead of adding to it — floored at 0 since a
  // credit larger than post-close spend can't make "owed so far" negative.
  const postCloseTotal = cardItems
    .filter(i => statementDay === null || !isPreCloseDate(new Date(i.date), statementDay))
    .reduce((sum, i) => sum + (i.isCredit ? -i.amount : i.amount), 0);

  return client.monthlyEntry.update({
    where: { id: entryId },
    data: { statementAmount: Math.max(0, postCloseTotal) },
    select: { id: true, amount: true, statementAmount: true, billedAmount: true },
  });
}

// Apply a CC charge's effect onto its card's MonthlyEntry (creating the
// entry if this is the first charge against it this month).
export async function applyCCEffect(
  client: DbClient,
  userId: string,
  monthId: string,
  ccTemplateId: string,
  date: Date,
  amount: number,
): Promise<EntryFields | null> {
  const template = await client.lineItemTemplate.findFirst({
    where: { id: ccTemplateId, userId, category: "CREDIT_CARD" },
  });
  if (!template) return null;

  let entry = await client.monthlyEntry.findUnique({
    where: { monthId_templateId: { monthId, templateId: ccTemplateId } },
  });
  if (!entry) {
    entry = await client.monthlyEntry.create({
      // A brand-new entry created here (first charge landed before month
      // setup ever ran for this card) has nothing carried in — 0, not null,
      // so Pending treats it the same as any other freshly-opened card.
      data: { monthId, templateId: ccTemplateId, amount: 0, billedAmount: 0, carriedInAmount: 0, isPaid: false, statementAmount: 0 },
    });
  }

  const statementDay = template.statementDay ?? null;
  const isPreClose = isPreCloseDate(date, statementDay);

  if (isPreClose) {
    return client.monthlyEntry.update({
      where: { id: entry.id },
      data: {
        amount: entry.amount + amount,
        billedAmount: (entry.billedAmount ?? entry.amount) + amount,
      },
      select: { id: true, amount: true, statementAmount: true, billedAmount: true },
    });
  }
  return recomputeStatementAmount(client, entry.id, monthId, ccTemplateId, statementDay);
}

// Paying down a card's carriedInAmount only ever touches the entry that's
// CURRENTLY tracking the debt (this cycle's entry) — the original bill's
// own month, where the debt actually came from, never gets told it was
// settled and is left looking perpetually unpaid forever. This walks
// backward from the entry whose carriedInAmount just got reduced, applying
// the payment to the original (earlier) bill's own paidAmount/isPaid, and
// keeps walking further back only if that earlier bill was itself still
// carrying unresolved debt from before it.
export async function settleCarriedDebtBackward(
  client: DbClient,
  userId: string,
  templateId: string,
  month: number,
  year: number,
  payAmount: number,
): Promise<void> {
  let remaining = payAmount;
  let m = month;
  let y = year;
  for (let hops = 0; hops < 12 && remaining > 0.5; hops++) {
    ({ month: m, year: y } = prevMonthYear(m, y));
    const prevEntry = await client.monthlyEntry.findFirst({
      where: { templateId, isPaid: false, month: { userId, month: m, year: y } },
      select: { id: true, amount: true, cashbackAmount: true, paidAmount: true, carriedInAmount: true },
    });
    if (!prevEntry) break;

    const net = prevEntry.amount - (prevEntry.cashbackAmount ?? 0);
    const alreadyPaid = prevEntry.paidAmount ?? 0;
    const outstanding = net - alreadyPaid;
    if (outstanding <= 0) break;

    const applied = Math.min(remaining, outstanding);
    const newPaid = alreadyPaid + applied;
    const nowFullyPaid = newPaid >= net;

    await client.monthlyEntry.update({
      where: { id: prevEntry.id },
      data: {
        paidAmount: nowFullyPaid ? (newPaid > net ? newPaid : null) : newPaid,
        ...(nowFullyPaid && { isPaid: true, paidOn: new Date() }),
      },
    });
    // Record the actual amount applied in THIS event — paidAmount above is
    // a cumulative snapshot and can't tell how much of it happened now vs.
    // in the bill's own month, but Payables' "settled this month" figure
    // needs exactly that.
    await client.carriedDebtSettlement.create({
      data: { userId, templateId, billMonth: m, billYear: y, amount: applied },
    });

    remaining -= applied;
    if (!nowFullyPaid || !prevEntry.carriedInAmount || prevEntry.carriedInAmount <= 0) break;
  }
}

// Reverse a CC charge's effect off its card's MonthlyEntry. Call this
// BEFORE the AdHocItem row is deleted (post-close needs it excluded from
// the live re-sum) or AFTER it's been updated to new values (edit — the
// captured old amount is used for the delta, not the row's current state).
export async function reverseCCEffect(
  client: DbClient,
  userId: string,
  monthId: string,
  ccTemplateId: string,
  date: Date,
  amount: number,
): Promise<EntryFields | null> {
  const entry = await client.monthlyEntry.findFirst({
    where: { monthId, template: { id: ccTemplateId, category: "CREDIT_CARD", userId } },
    select: {
      id: true, amount: true, statementAmount: true, billedAmount: true,
      carriedInAmount: true, cashbackAmount: true, isPaid: true,
      template: { select: { statementDay: true } },
    },
  });
  if (!entry) return null;

  const statementDay = entry.template.statementDay ?? null;
  const isPreClose = isPreCloseDate(date, statementDay);

  if (isPreClose) {
    const newAmount = Math.max(0, entry.amount - amount);
    // Deleting/refunding the only charge this cycle can bring a card back
    // down to owing nothing — self-heal it the same way a freshly-created
    // zero-balance entry is auto-closed, instead of leaving it pending for
    // a "paid" tap that settles nothing.
    const autoPaid = !entry.isPaid && isZeroCCBalance(newAmount, entry.carriedInAmount, entry.cashbackAmount);
    return client.monthlyEntry.update({
      where: { id: entry.id },
      data: {
        amount: newAmount,
        billedAmount: Math.max(0, (entry.billedAmount ?? entry.amount) - amount),
        ...(autoPaid && { isPaid: true, paidOn: new Date() }),
      },
      select: { id: true, amount: true, statementAmount: true, billedAmount: true },
    });
  }
  return recomputeStatementAmount(client, entry.id, monthId, ccTemplateId, statementDay);
}
