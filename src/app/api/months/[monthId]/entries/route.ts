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
  const { entryId, isPaid, amount, notes, statementAmount } = body;

  // Single query: update only if the entry belongs to this user's month
  const updated = await db.monthlyEntry.update({
    where: { id: entryId, monthId, month: { userId: session.user.id } },
    data: {
      ...(isPaid !== undefined && { isPaid, paidOn: isPaid ? new Date() : null }),
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
