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
    include: { template: true },
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

  // On lift: create income in the selected month and schedule next-month payment increase
  if (isLifting) {
    const liftMonth: number = body.liftMonth ?? new Date().getMonth() + 1;
    const liftYear: number = body.liftYear ?? new Date().getFullYear();

    // Ensure month record exists
    let monthRecord = await db.month.findUnique({
      where: { userId_month_year: { userId: session.user.id, month: liftMonth, year: liftYear } },
    });
    if (!monthRecord) {
      monthRecord = await db.month.create({
        data: { userId: session.user.id, month: liftMonth, year: liftYear, salaryIncome: 0 },
      });
    }

    // Create income AdHocItem for the lift amount
    await db.adHocItem.create({
      data: {
        monthId: monthRecord.id,
        name: `${chit.template.name} — Chit Lifted`,
        amount: body.liftedAmount ?? chit.totalValue,
        type: "INCOME",
        category: "OTHER_INCOME",
        date: new Date(liftYear, liftMonth - 1, 1),
      },
    });

    // Schedule increased monthly payment from next month via pendingAmount
    if (body.monthlyLiftedAmount) {
      const nextMonth = liftMonth === 12 ? 1 : liftMonth + 1;
      const nextYear = liftMonth === 12 ? liftYear + 1 : liftYear;
      await db.lineItemTemplate.update({
        where: { id: chit.templateId },
        data: {
          pendingAmount: body.monthlyLiftedAmount,
          pendingFromMonth: nextMonth,
          pendingFromYear: nextYear,
        },
      });
    }
  }

  return NextResponse.json(updated);
}
