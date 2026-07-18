import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, EntryPatchSchema } from "@/lib/validation";
import { computePaymentUpdate } from "@/lib/entry-payment";

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
  const { entryId, isPaid, amount, billedAmount, notes, statementAmount, paidAmount, cashbackAmount } = parsed.data;

  // Resolve payment state — paidAmount takes precedence over isPaid toggle
  const paymentData: Record<string, unknown> = {};

  if (paidAmount !== undefined && paidAmount !== null) {
    const entry = await db.monthlyEntry.findFirst({
      where: { id: entryId, monthId, month: { userId: session.user.id } },
      select: { amount: true, cashbackAmount: true },
    });
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  const updated = await db.monthlyEntry.update({
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
  if (updated.isPaid && updated.template.category === "CHIT_FUND") {
    const chit = await db.chitFund.findUnique({ where: { templateId: updated.templateId } });
    if (chit && !chit.isLifted) {
      await db.chitFund.update({
        where: { id: chit.id },
        data: { accumulatedSavings: { increment: updated.amount } },
      });
    }
  }

  return NextResponse.json(updated);
}
