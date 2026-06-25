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
      // Income templates don't create entries — they just inform income pre-fill.
      // Still promote pending amounts so the template.amount stays current.
      if (t.templateType === "INCOME") {
        if (t.pendingAmount != null && t.pendingFromMonth != null && t.pendingFromYear != null) {
          const kicks = year > t.pendingFromYear ||
            (year === t.pendingFromYear && month >= t.pendingFromMonth);
          if (kicks) {
            await db.lineItemTemplate.update({
              where: { id: t.id },
              data: { amount: t.pendingAmount, pendingAmount: null, pendingFromMonth: null, pendingFromYear: null },
            });
          }
        }
        continue;
      }

      // Yearly templates only appear in their designated month
      if (t.frequency === "YEARLY" && t.dueMonth !== month) continue;

      // Promote pending amount if its effective month has arrived
      let baseAmount = t.amount;
      if (t.pendingAmount != null && t.pendingFromMonth != null && t.pendingFromYear != null) {
        const kicks = year > t.pendingFromYear ||
          (year === t.pendingFromYear && month >= t.pendingFromMonth);
        if (kicks) {
          baseAmount = t.pendingAmount;
          await db.lineItemTemplate.update({
            where: { id: t.id },
            data: { amount: t.pendingAmount, pendingAmount: null, pendingFromMonth: null, pendingFromYear: null },
          });
        }
      }

      let amount = baseAmount;
      if (t.chitFund) {
        amount = t.chitFund.isLifted
          ? (t.chitFund.monthlyLiftedAmount ?? baseAmount)
          : t.chitFund.monthlyUnliftedAmount;
      } else if (t.category === "CREDIT_CARD" && prevStatements.has(t.id)) {
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
