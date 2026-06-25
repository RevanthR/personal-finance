import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// GET /api/months — list all months for current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const months = await db.month.findMany({
    where: { userId: session.user.id },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: {
      _count: { select: { entries: true, adHocItems: true } },
    },
  });

  return NextResponse.json(months);
}

// POST /api/months — create or get current month, auto-populate entries
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { month, year, salaryIncome } = body;

  // Upsert month
  let monthRecord = await db.month.findUnique({
    where: { userId_month_year: { userId: session.user.id, month, year } },
  });

  if (!monthRecord) {
    monthRecord = await db.month.create({
      data: { userId: session.user.id, month, year, salaryIncome: salaryIncome || 0 },
    });
  } else if (salaryIncome !== undefined) {
    monthRecord = await db.month.update({
      where: { id: monthRecord.id },
      data: { salaryIncome },
    });
  }

  // Auto-populate entries from active templates if not done yet
  if (!monthRecord.isPopulated) {
    const templates = await db.lineItemTemplate.findMany({
      where: { userId: session.user.id, isActive: true },
      include: { chitFund: true },
    });

    // Find previous month to carry CC statement amounts forward
    const prevMonthNum = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = await db.month.findUnique({
      where: { userId_month_year: { userId: session.user.id, month: prevMonthNum, year: prevYear } },
      include: { entries: { select: { templateId: true, statementAmount: true } } },
    });
    const prevStatements = new Map(
      (prevMonth?.entries ?? [])
        .filter(e => e.statementAmount != null)
        .map(e => [e.templateId, e.statementAmount!])
    );

    for (const t of templates) {
      let amount = t.amount;

      if (t.chitFund) {
        amount = t.chitFund.isLifted
          ? (t.chitFund.monthlyLiftedAmount ?? t.amount)
          : t.chitFund.monthlyUnliftedAmount;
      } else if (t.category === "CREDIT_CARD" && prevStatements.has(t.id)) {
        // Bill for this month = last month's card spend
        amount = prevStatements.get(t.id)!;
      }

      await db.monthlyEntry.upsert({
        where: { monthId_templateId: { monthId: monthRecord.id, templateId: t.id } },
        create: { monthId: monthRecord.id, templateId: t.id, amount },
        update: {},
      });
    }

    await db.month.update({ where: { id: monthRecord.id }, data: { isPopulated: true } });
    monthRecord = { ...monthRecord, isPopulated: true };
  }

  return NextResponse.json(monthRecord);
}
