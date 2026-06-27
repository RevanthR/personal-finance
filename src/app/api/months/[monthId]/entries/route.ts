import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/months/[monthId]/entries — update a single entry (mark paid, change amount)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ monthId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { monthId } = await params;
  const body = await req.json();
  const { entryId, isPaid, amount, notes, statementAmount, paidAmount } = body;

  // Resolve payment state — paidAmount takes precedence over isPaid toggle
  const paymentData: Record<string, unknown> = {};

  if (paidAmount !== undefined) {
    const entry = await db.monthlyEntry.findFirst({
      where: { id: entryId, monthId, month: { userId: session.user.id } },
      select: { amount: true },
    });
    const dupeAmount = amount ?? entry?.amount ?? 0;
    const paid = Number(paidAmount);
    if (paid >= dupeAmount) {
      // Paid in full
      paymentData.isPaid = true;
      paymentData.paidOn = new Date();
      paymentData.paidAmount = null;
    } else {
      paymentData.paidAmount = paid > 0 ? paid : null;
    }
  } else if (isPaid !== undefined) {
    paymentData.isPaid = isPaid;
    paymentData.paidOn = isPaid ? new Date() : null;
    if (!isPaid) paymentData.paidAmount = null; // reset partial when un-paying
  }

  const updated = await db.monthlyEntry.update({
    where: { id: entryId, monthId, month: { userId: session.user.id } },
    data: {
      ...paymentData,
      ...(amount !== undefined && { amount }),
      ...(notes !== undefined && { notes }),
      ...(statementAmount !== undefined && { statementAmount: statementAmount === null ? null : Number(statementAmount) }),
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
