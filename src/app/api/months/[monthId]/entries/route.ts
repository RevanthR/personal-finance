import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, EntryPatchSchema } from "@/lib/validation";
import { computePaymentUpdate } from "@/lib/entry-payment";
import { effectivePaid } from "@/lib/finance-utils";
import { recordEntryCashDelta } from "@/lib/cash-payment";
import { getCurrentMonthYear } from "@/lib/utils";
import { closePushForUser, PAYMENT_REMINDER_PUSH_TAG } from "@/lib/push";

// PATCH /api/months/[monthId]/entries — update a single entry (mark paid, change amount)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ monthId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { monthId } = await params;

  const parsed = validate(EntryPatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { entryId, isPaid, amount, billedAmount, notes, statementAmount, paidAmount, cashbackAmount, paidViaCardTemplateId } = parsed.data;

  // Always fetch the entry first (not just on the paidAmount path) — needed
  // both for the netAmount calc below and to tell whether this entry
  // belongs to an earlier month than today (a carried-over bill being paid
  // late), which changes the "settled this month" bookkeeping.
  const entry = await db.monthlyEntry.findFirst({
    where: { id: entryId, monthId, month: { userId: session.user.id } },
    select: {
      templateId: true, amount: true, billedAmount: true, cashbackAmount: true, isPaid: true, paidAmount: true,
      paidViaCardTemplateId: true,
      template: { select: { category: true } },
      month: { select: { month: true, year: true } },
    },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Paying via a card only makes sense for a non-CC bill, and only as a
  // full payment (v1 scope — splitting one payment across two liabilities
  // is a real complication saved for if it's actually needed). Re-verify
  // the card itself server-side rather than trusting the client-supplied id.
  if (paidViaCardTemplateId) {
    if (entry.template.category === "CREDIT_CARD" || isPaid !== true) {
      return NextResponse.json({ error: "paidViaCardTemplateId only applies to a non-CC bill being paid in full" }, { status: 400 });
    }
    const card = await db.lineItemTemplate.findFirst({
      where: { id: paidViaCardTemplateId, userId: session.user.id, category: "CREDIT_CARD" },
      select: { id: true },
    });
    if (!card) return NextResponse.json({ error: "Invalid card" }, { status: 400 });
  }

  // Resolve payment state — paidAmount takes precedence over isPaid toggle
  const paymentData: Record<string, unknown> = {};

  if (paidAmount !== undefined && paidAmount !== null) {
    const appliedCashback = cashbackAmount !== undefined && cashbackAmount !== null
      ? cashbackAmount
      : (entry.cashbackAmount ?? 0);
    const netAmount = (amount ?? entry.amount) - appliedCashback;
    Object.assign(paymentData, computePaymentUpdate(netAmount, paidAmount));
  } else if (isPaid !== undefined) {
    paymentData.isPaid = isPaid;
    paymentData.paidOn = isPaid ? new Date() : null;
    paymentData.paidAmount = null; // always clear: on pay → fall back to entry.amount; on un-pay → reset partial
    // Attribute to a card when paying that way; a plain pay/un-pay clears
    // any previous attribution (see the apply/reverse side effect below).
    paymentData.paidViaCardTemplateId = isPaid && paidViaCardTemplateId ? paidViaCardTemplateId : null;
  }

  const paidBefore = effectivePaid({
    amount: entry.amount, isPaid: entry.isPaid, paidAmount: entry.paidAmount, cashbackAmount: entry.cashbackAmount,
  });

  const { month: todayMonth, year: todayYear } = getCurrentMonthYear();
  const isCarriedOverBill = entry.month.year < todayYear || (entry.month.year === todayYear && entry.month.month < todayMonth);
  const cardInvolved = !!entry.paidViaCardTemplateId || (isPaid === true && !!paidViaCardTemplateId);

  const updated = await db.$transaction(async (tx) => {
    const updatedEntry = await tx.monthlyEntry.update({
      where: { id: entryId, monthId, month: { userId: session.user.id } },
      data: {
        ...paymentData,
        ...(amount          !== undefined && { amount }),
        ...(billedAmount    !== undefined && { billedAmount }),
        ...(notes           !== undefined && { notes }),
        ...(statementAmount !== undefined && { statementAmount: statementAmount === null ? null : statementAmount }),
        ...(cashbackAmount  !== undefined && { cashbackAmount: cashbackAmount !== null && cashbackAmount > 0 ? cashbackAmount : null }),
      },
      include: { template: true },
    });

    // Cash ledger: one row for the change in this bill's cash-paid total.
    await recordEntryCashDelta(
      tx,
      session.user.id,
      entryId,
      { amount: entry.amount, cashbackAmount: entry.cashbackAmount, isPaid: entry.isPaid, paidAmount: entry.paidAmount, paidViaCardTemplateId: entry.paidViaCardTemplateId },
      { amount: updatedEntry.amount, cashbackAmount: updatedEntry.cashbackAmount, isPaid: updatedEntry.isPaid, paidAmount: updatedEntry.paidAmount, paidViaCardTemplateId: updatedEntry.paidViaCardTemplateId },
    );

    // If this is an unlifted chit fund, accumulate savings
    if (updatedEntry.isPaid && updatedEntry.template.category === "CHIT_FUND") {
      const chit = await tx.chitFund.findUnique({ where: { templateId: updatedEntry.templateId } });
      if (chit && !chit.isLifted) {
        await tx.chitFund.update({
          where: { id: chit.id },
          data: { accumulatedSavings: { increment: updatedEntry.amount } },
        });
      }
    }

    // Cash timing is handled by the CashPayment row above (dated `now`).
    // For a carried-over bill (belongs to an earlier month) also log a
    // CarriedDebtSettlement so Payables' "settled this month" list can show
    // what really moved this month vs the bill's whole original amount.
    // Card-settled bills move no cash, so nothing to log.
    if (isCarriedOverBill && !cardInvolved) {
      const paidAfter = effectivePaid({
        amount: updatedEntry.amount, isPaid: updatedEntry.isPaid, paidAmount: updatedEntry.paidAmount,
        cashbackAmount: updatedEntry.cashbackAmount,
      });
      const delta = paidAfter - paidBefore;
      if (delta > 0) {
        await tx.carriedDebtSettlement.create({
          data: { userId: session.user.id, templateId: updatedEntry.templateId, billMonth: entry.month.month, billYear: entry.month.year, amount: delta },
        });
      }
    }

    return updatedEntry;
  });

  // Marking anything paid clears the "payment due" reminder on every
  // device, not just this one — it's a single per-user banner (possibly
  // covering several bills), so paying any one of them means it's done its
  // job rather than trying to track exactly which entry it was about.
  if (updated.isPaid && !entry.isPaid) {
    await closePushForUser(session.user.id, PAYMENT_REMINDER_PUSH_TAG, "/dashboard").catch(() => {});
  }

  return NextResponse.json(updated);
}
