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
  const { entryId, isPaid, amount, notes } = body;

  // Verify this entry belongs to the user's month
  const entry = await db.monthlyEntry.findFirst({
    where: { id: entryId, monthId, month: { userId: session.user.id } },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.monthlyEntry.update({
    where: { id: entryId },
    data: {
      isPaid: isPaid ?? entry.isPaid,
      paidOn: isPaid === true ? new Date() : isPaid === false ? null : entry.paidOn,
      amount: amount ?? entry.amount,
      notes: notes ?? entry.notes,
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
