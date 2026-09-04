import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, EntryPatchSchema } from "@/lib/validation";
import { computePaymentUpdate } from "@/lib/entry-payment";
import { effectivePaid } from "@/lib/finance-utils";
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
  const { entryId, isPaid, amount, billedAmount, notes, statementAmount, paidAmount, cashbackAmount, payCarriedAmount, paidViaCardTemplateId } = parsed.data;

  // Always fetch the entry first (not just on the paidAmount path) — needed
  // both for the netAmount calc below and to tell whether this entry
  // belongs to an earlier month than today (a carried-over bill being paid
  // late), in which case paying it moves cash out of TODAY's balance, not
  // its own already-closed month.
  const entry = await db.monthlyEntry.findFirst({
    where: { id: entryId, monthId, month: { userId: session.user.id } },
    select: {
      templateId: true, amount: true, billedAmount: true, carriedInAmount: true, cashbackAmount: true, isPaid: true, paidAmount: true,
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

  // Settle carried-forward CC debt directly, independent of the normal
  // paid/pending flow — a still-open card's tick is disabled (its running
  // amount isn't a real bill yet), but carriedInAmount IS real, already-
  // billed debt from before, and shouldn't have to wait for this cycle's
  // statement to close before it can be paid off. Reduces amount/billedAmount
  // by the same delta (that debt should not reappear once this cycle's
  // statement does close) and moves the cash out today via carriedDebtPaid,
  // NOT openingBalance — openingBalance is a frozen "what I started the
  // month with" snapshot; a mid-month payment toward old debt is tracked
  // separately so that snapshot never gets silently overwritten.
  if (payCarriedAmount !== undefined) {
    const carried = Math.max(0, entry.carriedInAmount ?? 0);
    const pay = Math.min(payCarriedAmount, carried);
    if (pay <= 0) return NextResponse.json({ error: "Nothing carried to pay" }, { status: 400 });

    const updated = await db.$transaction(async (tx) => {
      const updatedEntry = await tx.monthlyEntry.update({
        where: { id: entryId, monthId, month: { userId: session.user.id } },
        data: {
          amount: Math.max(0, entry.amount - pay),
          ...(entry.billedAmount != null && { billedAmount: Math.max(0, entry.billedAmount - pay) }),
          carriedInAmount: carried - pay,
        },
      });
      await tx.month.updateMany({
        where: { userId: session.user.id, month: entry.month.month, year: entry.month.year },
        data: { carriedDebtPaid: { increment: pay } },
      });
      return updatedEntry;
    });

    return NextResponse.json(updated);
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
  const wasPaidViaCard = entry.paidViaCardTemplateId;
  // A card is involved on either side of this event — real cash didn't
  // move for whichever part is card-attributed, so the carried-over cash
  // tracking below must skip it (see the apply/reverse side effect instead).
  const cardInvolved = !!wasPaidViaCard || (isPaid === true && !!paidViaCardTemplateId);

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

    // Paying a bill "via card" now just records the attribution
    // (paidViaCardTemplateId) — the card spend itself lands as a normal
    // AdHocItem charge through Gmail sync, so creating one here too would
    // double it. The attribution still keeps this bill out of cash totals
    // (finance-utils.ts) until that card's own statement is paid off.

    // Paying (or unpaying) a carried-over bill from an earlier month moves
    // real cash today — track it via carriedDebtPaid (today's month), not
    // openingBalance (a frozen start-of-month snapshot), without touching
    // the bill's own (already closed) month. Skipped entirely when a card
    // is involved — no cash moved, see the apply/reverse effect above.
    if (isCarriedOverBill && !cardInvolved) {
      const paidAfter = effectivePaid({
        amount: updatedEntry.amount, isPaid: updatedEntry.isPaid, paidAmount: updatedEntry.paidAmount,
        cashbackAmount: updatedEntry.cashbackAmount,
      });
      const delta = paidAfter - paidBefore;
      if (delta !== 0) {
        await tx.month.updateMany({
          where: { userId: session.user.id, month: todayMonth, year: todayYear },
          data: { carriedDebtPaid: { increment: delta } },
        });
      }
      // Record the actual amount moved by this event (not the bill's whole
      // amount), for Payables' "settled this month" figure. Skip un-pay
      // (delta < 0): nothing was paid, so there's nothing to log as settled.
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
