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

    // Find previous month to carry CC statement amounts + unpaid balances forward
    const prevMonthNum = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = await db.month.findUnique({
      where: { userId_month_year: { userId: session.user.id, month: prevMonthNum, year: prevYear } },
      include: {
        entries: {
          select: {
            templateId: true, statementAmount: true,
            isPaid: true, amount: true, paidAmount: true,
          },
          include: { template: { select: { category: true, name: true } } },
        },
      },
    });
    const prevStatements = new Map(
      (prevMonth?.entries ?? [])
        .filter(e => e.statementAmount != null)
        .map(e => [e.templateId, e.statementAmount!])
    );

    // Carry-forward: unpaid/partially-paid entries from previous month
    // Excluded: LOAN and CHIT_FUND (intentional — those are tracked differently)
    const CARRY_FORWARD_EXCLUDE = new Set(["LOAN", "CHIT_FUND"]);
    const prevCCOutstanding = new Map<string, number>(); // templateId → outstanding
    const nonCCCarryForwards: { name: string; amount: number; category: string }[] = [];
    for (const e of prevMonth?.entries ?? []) {
      if (e.isPaid) continue;
      const cat = e.template.category;
      if (CARRY_FORWARD_EXCLUDE.has(cat)) continue;
      const outstanding = e.amount - (e.paidAmount ?? 0);
      if (outstanding <= 0) continue;
      if (cat === "CREDIT_CARD") {
        prevCCOutstanding.set(e.templateId, outstanding);
      } else {
        nonCCCarryForwards.push({ name: e.template.name, amount: outstanding, category: cat });
      }
    }

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

      // Skip templates that have ended before this month
      if (t.endsOnYear != null && t.endsOnMonth != null) {
        if (year > t.endsOnYear || (year === t.endsOnYear && month > t.endsOnMonth)) continue;
      }

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
      } else if (t.category === "CREDIT_CARD") {
        amount = prevStatements.get(t.id) ?? baseAmount;
        amount += prevCCOutstanding.get(t.id) ?? 0;
      }

      await db.monthlyEntry.upsert({
        where: { monthId_templateId: { monthId: monthRecord.id, templateId: t.id } },
        create: { monthId: monthRecord.id, templateId: t.id, amount },
        update: {},
      });
    }

    // Create carry-forward AdHocItems for non-CC unpaid balances from previous month
    for (const cf of nonCCCarryForwards) {
      await db.adHocItem.create({
        data: {
          monthId: monthRecord.id,
          name: `↩ ${cf.name}`,
          amount: cf.amount,
          type: "EXPENSE",
          category: cf.category as import("@/generated/prisma/client").Category,
          date: new Date(year, month - 1, 1),
          notes: "carry_forward",
        },
      });
    }

    await db.month.update({ where: { id: monthRecord.id }, data: { isPopulated: true } });
    monthRecord = { ...monthRecord, isPopulated: true };
  }

  return NextResponse.json(monthRecord);
}
