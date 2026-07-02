import { getSession } from "@/lib/get-session";
import { getActiveTemplates } from "@/lib/cached-queries";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getCurrentMonthYear } from "@/lib/utils";

function isTemplateActiveInMonth(
  t: { endsOnYear: number | null; endsOnMonth: number | null },
  m: number, y: number
) {
  if (t.endsOnYear != null && t.endsOnMonth != null) {
    if (y > t.endsOnYear || (y === t.endsOnYear && m > t.endsOnMonth)) return false;
  }
  return true;
}

function monthNav(m: number, y: number, todayM: number, todayY: number) {
  const isToday = m === todayM && y === todayY;
  return isToday ? "/dashboard" : `/dashboard?month=${m}&year=${y}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { month: todayMonth, year: todayYear } = getCurrentMonthYear();
  const params = await searchParams;

  const targetMonth = params.month ? Math.min(12, Math.max(1, parseInt(params.month))) : todayMonth;
  const targetYear  = params.year  ? Math.max(2020, parseInt(params.year))            : todayYear;

  const isFuture = targetYear > todayYear || (targetYear === todayYear && targetMonth > todayMonth);

  // Prev/next URLs
  const prevM = targetMonth === 1  ? 12 : targetMonth - 1;
  const prevY = targetMonth === 1  ? targetYear - 1 : targetYear;
  const nextM = targetMonth === 12 ? 1  : targetMonth + 1;
  const nextY = targetMonth === 12 ? targetYear + 1 : targetYear;
  const prevUrl = monthNav(prevM, prevY, todayMonth, todayYear);
  const nextUrl = monthNav(nextM, nextY, todayMonth, todayYear);

  // ── Future month → projected view ─────────────────────────────────────────
  if (isFuture) {
    const isImmediateNext =
      (targetYear === todayYear && targetMonth === todayMonth + 1) ||
      (todayMonth === 12 && targetMonth === 1 && targetYear === todayYear + 1);

    const [allTemplates, currentMonthRecord, futureMonthRecord, pendingReceivables] = await Promise.all([
      getActiveTemplates(userId),
      isImmediateNext
        ? db.month.findUnique({
            where: { userId_month_year: { userId, month: todayMonth, year: todayYear } },
            select: { entries: { select: { templateId: true, statementAmount: true } } },
          })
        : Promise.resolve(null),
      db.month.findUnique({
        where: { userId_month_year: { userId, month: targetMonth, year: targetYear } },
        select: { adHocItems: { select: { amount: true, type: true } } },
      }),
      db.receivable.findMany({
        where: { userId, status: "PENDING", expectedDate: { not: null } },
        select: { expectedAmount: true, expectedDate: true },
      }),
    ]);

    // CC statement amounts: what's already accumulated for next month's bill
    const ccStatements = new Map<string, number>();
    for (const e of currentMonthRecord?.entries ?? []) {
      if (e.statementAmount != null && e.statementAmount > 0) {
        ccStatements.set(e.templateId, e.statementAmount);
      }
    }

    const incomeTemplates  = allTemplates.filter(t => t.templateType === "INCOME");
    const expenseTemplates = allTemplates.filter(t => t.templateType !== "INCOME");

    const templateIncome = incomeTemplates.reduce((sum, t) => {
      const kicks = t.pendingAmount != null && t.pendingFromYear != null && t.pendingFromMonth != null &&
        (targetYear > t.pendingFromYear || (targetYear === t.pendingFromYear && targetMonth >= t.pendingFromMonth));
      return sum + (kicks ? t.pendingAmount! : t.amount);
    }, 0);

    // AdHocItems already in this month's record (e.g. received receivables)
    const adHocIncomeInMonth = futureMonthRecord?.adHocItems
      .filter(i => i.type === "INCOME")
      .reduce((s, i) => s + i.amount, 0) ?? 0;

    // Pending receivables whose expected date falls in this projected month
    const receivableIncome = pendingReceivables
      .filter(r => {
        const d = new Date(r.expectedDate!);
        return d.getFullYear() === targetYear && d.getMonth() + 1 === targetMonth;
      })
      .reduce((s, r) => s + r.expectedAmount, 0);

    const projIncome = templateIncome + adHocIncomeInMonth + receivableIncome;

    const projExpenses = expenseTemplates
      .filter(t =>
        (t.frequency === "MONTHLY" || (t.frequency === "YEARLY" && t.dueMonth === targetMonth)) &&
        isTemplateActiveInMonth(t, targetMonth, targetYear)
      )
      .map(t => ({
        name: t.name,
        amount: t.category === "CREDIT_CARD" && ccStatements.has(t.id)
          ? ccStatements.get(t.id)!
          : t.chitFund
            ? (t.chitFund.isLifted ? (t.chitFund.monthlyLiftedAmount ?? t.amount) : t.chitFund.monthlyUnliftedAmount)
            : t.amount,
        category: t.category,
        customCategory: t.customCategory,
        isFixed: t.isFixed,
        dueDateDay: t.dueDateDay,
      }));

    // Use the same DashboardClient layout with projected data — consistent UX
    return (
      <DashboardClient
        currentMonth={null}
        recentMonths={[]}
        ccTemplates={[]}
        incomeTemplates={[]}
        todayMonth={todayMonth}
        todayYear={todayYear}
        userId={userId}
        targetMonth={targetMonth}
        targetYear={targetYear}
        prevUrl={prevUrl}
        nextUrl={nextUrl}
        projectedIncome={projIncome}
        projectedEntries={projExpenses}
      />
    );
  }

  // ── Actual (past or current) month ────────────────────────────────────────
  const [currentMonth, recentMonths, ccTemplates, allTemplates] = await Promise.all([
    db.month.findUnique({
      where: { userId_month_year: { userId, month: targetMonth, year: targetYear } },
      include: {
        entries: {
          include: { template: { include: { chitFund: true } } },
          orderBy: { template: { sortOrder: "asc" } },
        },
        adHocItems: { orderBy: { date: "desc" } },
      },
    }),
    db.month.findMany({
      where: { userId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 6,
      select: {
        id: true, month: true, year: true,
        salaryIncome: true, freelanceIncome: true, otherIncome: true,
        entries: { select: { id: true, templateId: true, amount: true, cashbackAmount: true } },
        adHocItems: { select: { id: true, type: true, amount: true, category: true, notes: true } },
      },
    }),
    db.lineItemTemplate.findMany({
      where: { userId, category: "CREDIT_CARD", isActive: true },
      select: { id: true, name: true, statementDay: true, dueDateDay: true },
    }),
    db.lineItemTemplate.findMany({
      where: { userId, isActive: true },
      include: { chitFund: true },
    }),
  ]);

  const incomeTemplates = allTemplates
    .filter(t => t.templateType === "INCOME")
    .map(t => ({
      id: t.id,
      name: t.name,
      amount: t.amount,
      pendingAmount: t.pendingAmount,
      pendingFromMonth: t.pendingFromMonth,
      pendingFromYear: t.pendingFromYear,
    }));

  // Pre-lift chit template IDs — their payments count as investment, not expense
  const preLiftChitTemplateIds = allTemplates
    .filter(t => t.templateType !== "INCOME" && t.category === "CHIT_FUND" && t.chitFund && !t.chitFund.isLifted)
    .map(t => t.id);

  // Lifted chit info — needed to correctly classify historical pre-lift payments in FY strip
  const liftedChitInfos = allTemplates
    .filter(t => t.category === "CHIT_FUND" && t.chitFund?.isLifted && t.chitFund?.liftedOn)
    .map(t => {
      const d = new Date(t.chitFund!.liftedOn!);
      return { templateId: t.id, liftMonth: d.getUTCMonth() + 1, liftYear: d.getUTCFullYear() };
    });

  return (
    <DashboardClient
      currentMonth={currentMonth ? JSON.parse(JSON.stringify(currentMonth)) : null}
      recentMonths={JSON.parse(JSON.stringify(recentMonths))}
      ccTemplates={JSON.parse(JSON.stringify(ccTemplates))}
      incomeTemplates={JSON.parse(JSON.stringify(incomeTemplates))}
      preLiftChitTemplateIds={preLiftChitTemplateIds}
      liftedChitInfos={liftedChitInfos}
      todayMonth={todayMonth}
      todayYear={todayYear}
      userId={userId}
      targetMonth={targetMonth}
      targetYear={targetYear}
      prevUrl={prevUrl}
      nextUrl={nextUrl}
    />
  );
}
