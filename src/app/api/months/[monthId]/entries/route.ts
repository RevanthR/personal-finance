import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, EntryPatchSchema } from "@/lib/validation";
import { computePaymentUpdate } from "@/lib/entry-payment";
import { effectivePaid } from "@/lib/finance-utils";
import { getCurrentMonthYear } from "@/lib/utils";

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
  const { entryId, isPaid, amount, billedAmount, notes, statementAmount, paidAmount, cashbackAmount, payCarriedAmount } = parsed.data;

  // Always fetch the entry first (not just on the paidAmount path) — needed
  // both for the netAmount calc below and to tell whether this entry
  // belongs to an earlier month than today (a carried-over bill being paid
  // late), in which case paying it moves cash out of TODAY's balance, not
  // its own already-closed month.
  const entry = await db.monthlyEntry.findFirst({
    where: { id: entryId, monthId, month: { userId: session.user.id } },
    select: {
      amount: true, billedAmount: true, carriedInAmount: true, cashbackAmount: true, isPaid: true, paidAmount: true,
      month: { select: { month: true, year: true } },
    },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Settle carried-forward CC debt directly, independent of the normal
  // paid/pending flow — a still-open card's tick is disabled (its running
  // amount isn't a real bill yet), but carriedInAmount IS real, already-
  // billed debt from before, and shouldn't have to wait for this cycle's
  // statement to close before it can be paid off. Reduces amount/billedAmount
  // by the same delta (that debt should not reappear once this cycle's
  // statement does close) and moves the cash out of today's balance right
  // now, same as paying any other carried-over bill.
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
        data: { openingBalance: { decrement: pay } },
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
  }

  const paidBefore = effectivePaid({
    amount: entry.amount, isPaid: entry.isPaid, paidAmount: entry.paidAmount, cashbackAmount: entry.cashbackAmount,
    statementAmount: null, billedAmount: null, template: { category: "", statementDay: null },
  });

  const { month: todayMonth, year: todayYear } = getCurrentMonthYear();
  const isCarriedOverBill = entry.month.year < todayYear || (entry.month.year === todayYear && entry.month.month < todayMonth);

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

    // Paying (or unpaying) a carried-over bill from an earlier month moves
    // real cash today — decrement today's running balance by exactly what
    // changed hands just now, without touching the bill's own (already
    // closed) month.
    if (isCarriedOverBill) {
      const paidAfter = effectivePaid({
        amount: updatedEntry.amount, isPaid: updatedEntry.isPaid, paidAmount: updatedEntry.paidAmount,
        cashbackAmount: updatedEntry.cashbackAmount, statementAmount: null, billedAmount: null,
        template: { category: "", statementDay: null },
      });
      const delta = paidAfter - paidBefore;
      if (delta !== 0) {
        await tx.month.updateMany({
          where: { userId: session.user.id, month: todayMonth, year: todayYear },
          data: { openingBalance: { decrement: delta } },
        });
      }
    }

    return updatedEntry;
  });

  return NextResponse.json(updated);
}
