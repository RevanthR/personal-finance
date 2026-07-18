import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, MonthPostSchema } from "@/lib/validation";
import { computeTemplateEndDate } from "@/lib/loan-utils";
import { computeTemplateEntryAmount, computePrevCCState, type PrevCCState } from "@/lib/entry-amount";
import { pendingAmountKicks } from "@/lib/utils";

// GET /api/months — list all months for current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = validate(MonthPostSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { month, year, salaryIncome } = parsed.data;
  const userId = session.user.id;

  // Atomic upsert instead of findUnique-then-create/update — two concurrent
  // requests for the same month/year previously could both see nothing and
  // both attempt to create, throwing an unhandled unique-constraint error.
  const monthRecord = await db.month.upsert({
    where: { userId_month_year: { userId, month, year } },
    create: { userId, month, year, salaryIncome: salaryIncome ?? 0 },
    update: salaryIncome !== undefined ? { salaryIncome } : {},
  });

  // Auto-populate entries from active templates if not done yet
  if (!monthRecord.isPopulated) {
    const templates = await db.lineItemTemplate.findMany({
      where: { userId, isActive: true },
      include: { chitFund: true },
    });

    // Find previous month to carry CC statement amounts + unpaid balances forward
    const prevMonthNum = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = await db.month.findUnique({
      where: { userId_month_year: { userId, month: prevMonthNum, year: prevYear } },
      include: {
        entries: {
          select: {
            templateId: true, statementAmount: true,
            isPaid: true, amount: true, billedAmount: true, paidAmount: true, cashbackAmount: true,
            template: { select: { category: true, name: true } },
          },
        },
      },
    });
    // templateId → last statement + any unpaid/overpaid carry, for CC templates
    const prevCCState = new Map<string, PrevCCState>(
      (prevMonth?.entries ?? [])
        .filter(e => e.template.category === "CREDIT_CARD")
        .map(e => [e.templateId, computePrevCCState(e)])
    );

    // Carry-forward: unpaid/partially-paid entries from previous month
    // Excluded: LOAN and CHIT_FUND (intentional — those are tracked differently)
    const CARRY_FORWARD_EXCLUDE = new Set(["LOAN", "CHIT_FUND"]);
    const nonCCCarryForwards: { name: string; amount: number; category: string }[] = [];
    for (const e of prevMonth?.entries ?? []) {
      const cat = e.template.category;
      if (cat === "CREDIT_CARD") continue;
      if (e.isPaid) continue;
      if (CARRY_FORWARD_EXCLUDE.has(cat)) continue;
      const outstanding = e.amount - (e.cashbackAmount ?? 0) - (e.paidAmount ?? 0);
      if (outstanding <= 0) continue;
      nonCCCarryForwards.push({ name: e.template.name, amount: outstanding, category: cat });
    }

    // Every write below is one atomic unit — a mid-way failure (timeout,
    // dropped connection) now rolls back entirely instead of leaving
    // isPopulated false with some entries/templates already committed,
    // which previously made a retry redo (and duplicate, e.g. carry-forward
    // AdHocItems) whatever had already gone through.
    await db.$transaction(async (tx) => {
      for (const t of templates) {
        // Income templates don't create entries — they just inform income pre-fill.
        // Still promote pending amounts so the template.amount stays current.
        if (t.templateType === "INCOME") {
          if (pendingAmountKicks(t, month, year)) {
            await tx.lineItemTemplate.update({
              where: { id: t.id },
              data: { amount: t.pendingAmount!, pendingAmount: null, pendingFromMonth: null, pendingFromYear: null },
            });
          }
          continue;
        }

        // Yearly templates only appear in their designated month
        if (t.frequency === "YEARLY" && t.dueMonth !== month) continue;

        // Skip templates that have ended before this month. Loans and chit
        // funds use a computed end date (amortization payoff / chit duration)
        // instead of the manual field — same rule the Year View projection
        // already applies — so a loan the math says is paid off stops
        // generating real bills here too, not just in the projection.
        if (t.category === "LOAN" || t.category === "CHIT_FUND") {
          const computedEnd = computeTemplateEndDate(t);
          if (computedEnd && (year > computedEnd.year || (year === computedEnd.year && month > computedEnd.month))) continue;
        } else if (t.endsOnYear != null && t.endsOnMonth != null) {
          if (year > t.endsOnYear || (year === t.endsOnYear && month > t.endsOnMonth)) continue;
        }

        // Skip chit fund entries for months before the chit started
        if (t.chitFund?.startDate) {
          const chitStart = new Date(t.chitFund.startDate);
          const chitStartY = chitStart.getUTCFullYear();
          const chitStartM = chitStart.getUTCMonth() + 1;
          if (year < chitStartY || (year === chitStartY && month < chitStartM)) continue;
        }

        // Promote pending amount if its effective month has arrived
        let baseAmount = t.amount;
        if (pendingAmountKicks(t, month, year)) {
          baseAmount = t.pendingAmount!;
          await tx.lineItemTemplate.update({
            where: { id: t.id },
            data: { amount: t.pendingAmount!, pendingAmount: null, pendingFromMonth: null, pendingFromYear: null },
          });
        }

        const { amount, billedAmount } = computeTemplateEntryAmount(t, baseAmount, prevCCState.get(t.id));

        await tx.monthlyEntry.upsert({
          where: { monthId_templateId: { monthId: monthRecord.id, templateId: t.id } },
          create: { monthId: monthRecord.id, templateId: t.id, amount, ...(billedAmount !== undefined && { billedAmount }) },
          update: {},
        });
      }

      // Create carry-forward AdHocItems for non-CC unpaid balances from previous month
      for (const cf of nonCCCarryForwards) {
        await tx.adHocItem.create({
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

      await tx.month.update({ where: { id: monthRecord.id }, data: { isPopulated: true } });
    }, { timeout: 15000 });

    monthRecord.isPopulated = true;
  }

  return NextResponse.json(monthRecord);
}
