import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { isZeroCCBalance, isPreCloseDate } from "@/lib/finance-utils";
import { prevMonthYear, getCurrentMonthYear } from "@/lib/utils";

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

// Recompute a CC card's pre-close `amount`/`billedAmount` from scratch:
// openingAmount (the frozen starting balance from month-open — see
// MonthlyEntry.openingAmount) plus every pre-close AdHocItem currently
// linked to this card this cycle. Self-healing the same way
// recomputeStatementAmount already is for next cycle's figure — replaces
// the old approach of nudging `amount` up/down by hand on every charge and
// repayment, which had no way to notice or correct drift once introduced
// (found via a real card whose live balance had quietly drifted a few
// rupees off from what its own transaction history actually added up to).
async function recomputePreCloseAmount(
  client: DbClient,
  entryId: string,
  monthId: string,
  ccTemplateId: string,
  statementDay: number | null,
): Promise<EntryFields> {
  const entry = await client.monthlyEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: { openingAmount: true, carriedInAmount: true, cashbackAmount: true, isPaid: true, billPaymentsAttributed: true },
  });

  const cardItems = await client.adHocItem.findMany({
    where: { monthId, type: "EXPENSE", ccTemplateId },
    select: { amount: true, date: true, isCredit: true },
  });
  const preCloseTotal = cardItems
    .filter(i => statementDay !== null && isPreCloseDate(new Date(i.date), statementDay))
    .reduce((sum, i) => sum + (i.isCredit ? -i.amount : i.amount), 0);

  // billPaymentsAttributed (a non-CC bill paid "via" this card — see
  // applyBillPaymentToCard below) has no AdHocItem row of its own, so it
  // has to be folded in explicitly here or a resum-from-AdHocItems-only
  // approach would silently drop it entirely.
  const newAmount = Math.max(0, entry.openingAmount + preCloseTotal + (entry.billPaymentsAttributed ?? 0));
  // Same self-heal as before: a card that lands back at zero owed this way
  // closes itself instead of sitting pending for a "paid" tap that would
  // settle nothing.
  const autoPaid = !entry.isPaid && isZeroCCBalance(newAmount, entry.carriedInAmount, entry.cashbackAmount);

  return client.monthlyEntry.update({
    where: { id: entryId },
    data: {
      amount: newAmount,
      billedAmount: newAmount,
      ...(autoPaid && { isPaid: true, paidOn: new Date() }),
    },
    select: { id: true, amount: true, statementAmount: true, billedAmount: true },
  });
}

// Apply a CC charge's effect onto its card's MonthlyEntry (creating the
// entry if this is the first charge against it this month). `amount` is
// unused in the body — both recompute functions below always re-derive the
// real total live rather than trust a delta — kept in the signature only
// because every call site already has a real amount on hand and stating it
// documents intent at each call site.
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
    return recomputePreCloseAmount(client, entry.id, monthId, ccTemplateId, statementDay);
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

// A non-CC bill settled with a card instead of cash — real money the card
// now owes, dated today (when the payment actually happened), same as any
// other manual charge. billPaymentsAttributed tracks that this portion
// isn't genuine card spend, so Expenditure/category totals don't count it
// twice (once under the bill's own category, once under the card).
//
// Updates billPaymentsAttributed BEFORE recomputing amount/billedAmount
// (rather than calling applyCCEffect and incrementing afterward) — the
// recompute above reads billPaymentsAttributed directly, so it has to
// already reflect this payment by the time it runs, or the newly-added
// amount would be computed away on the very next recompute.
export async function applyBillPaymentToCard(
  client: DbClient,
  userId: string,
  cardTemplateId: string,
  amount: number,
): Promise<void> {
  const { month, year } = getCurrentMonthYear();
  const monthRow = await client.month.findFirst({ where: { userId, month, year } });
  if (!monthRow) return;
  const template = await client.lineItemTemplate.findFirst({
    where: { id: cardTemplateId, userId, category: "CREDIT_CARD" },
  });
  if (!template) return;

  const entry = await client.monthlyEntry.upsert({
    where: { monthId_templateId: { monthId: monthRow.id, templateId: cardTemplateId } },
    // Mirrors applyCCEffect's own "first charge before month setup ran"
    // fallback — nothing carried in yet for a brand-new entry.
    create: {
      monthId: monthRow.id, templateId: cardTemplateId,
      amount: 0, billedAmount: 0, carriedInAmount: 0, isPaid: false, statementAmount: 0,
      billPaymentsAttributed: amount,
    },
    update: { billPaymentsAttributed: { increment: amount } },
  });

  const statementDay = template.statementDay ?? null;
  const isPreClose = isPreCloseDate(new Date(), statementDay);
  await (isPreClose
    ? recomputePreCloseAmount(client, entry.id, monthRow.id, cardTemplateId, statementDay)
    : recomputeStatementAmount(client, entry.id, monthRow.id, cardTemplateId, statementDay));
}

// Undo the above — un-marking a bill as "paid via card" removes the charge
// from that card the same way deleting the charge itself would. Same
// ordering requirement as applyBillPaymentToCard above.
export async function reverseBillPaymentFromCard(
  client: DbClient,
  userId: string,
  cardTemplateId: string,
  amount: number,
): Promise<void> {
  const { month, year } = getCurrentMonthYear();
  const monthRow = await client.month.findFirst({ where: { userId, month, year } });
  if (!monthRow) return;
  const template = await client.lineItemTemplate.findFirst({
    where: { id: cardTemplateId, userId, category: "CREDIT_CARD" },
  });
  if (!template) return;
  const existing = await client.monthlyEntry.findUnique({
    where: { monthId_templateId: { monthId: monthRow.id, templateId: cardTemplateId } },
  });
  if (!existing) return;

  await client.monthlyEntry.update({
    where: { id: existing.id },
    data: { billPaymentsAttributed: { decrement: amount } },
  });

  const statementDay = template.statementDay ?? null;
  const isPreClose = isPreCloseDate(new Date(), statementDay);
  await (isPreClose
    ? recomputePreCloseAmount(client, existing.id, monthRow.id, cardTemplateId, statementDay)
    : recomputeStatementAmount(client, existing.id, monthRow.id, cardTemplateId, statementDay));
}

// Reverse a CC charge's effect off its card's MonthlyEntry. Both the pre-
// and post-close paths are live re-sums of whatever AdHocItem rows
// currently exist (see recomputePreCloseAmount/recomputeStatementAmount),
// not an arithmetic delta against `amount` — so call this AFTER the
// AdHocItem row has already been deleted, or updated to its new values on
// an edit, not before. Only `date` actually affects anything here (it picks
// which side of the close boundary this routes to); `amount` is unused for
// the same reason as applyCCEffect above.
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
    return recomputePreCloseAmount(client, entry.id, monthId, ccTemplateId, statementDay);
  }
  return recomputeStatementAmount(client, entry.id, monthId, ccTemplateId, statementDay);
}
