import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// PATCH — update chit (including lift action)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chitId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chitId } = await params;
  const body = await req.json();

  const chit = await db.chitFund.findFirst({
    where: { id: chitId, userId: session.user.id },
  });
  if (!chit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isLifting = body.isLifted === true && !chit.isLifted;

  const updated = await db.chitFund.update({
    where: { id: chitId },
    data: {
      isLifted: body.isLifted ?? chit.isLifted,
      liftedOn: isLifting ? new Date() : chit.liftedOn,
      liftedAmount: body.liftedAmount ?? chit.liftedAmount,
      liftedUsedFor: body.liftedUsedFor ?? chit.liftedUsedFor,
      monthlyLiftedAmount: body.monthlyLiftedAmount ?? chit.monthlyLiftedAmount,
      accumulatedSavings: body.accumulatedSavings ?? chit.accumulatedSavings,
      endDate: body.endDate ? new Date(body.endDate) : chit.endDate,
    },
    include: { template: true },
  });

  // If lifting, update template amount to lifted amount
  if (isLifting && body.monthlyLiftedAmount) {
    await db.lineItemTemplate.update({
      where: { id: chit.templateId },
      data: { amount: body.monthlyLiftedAmount },
    });
  }

  return NextResponse.json(updated);
}
