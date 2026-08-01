import { Suspense } from "react";
import { getSession } from "@/lib/get-session";
import { getActiveTemplates } from "@/lib/cached-queries";
import { db } from "@/lib/db";
import { setupMonth } from "@/lib/months/setup-month";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getCurrentMonthYear } from "@/lib/utils";
import { isTemplateActiveInMonth } from "@/lib/loan-utils";
import DashboardLoading from "./loading";

function monthNav(m: number, y: number, todayM: number, todayY: number) {
  const isToday = m === todayM && y === todayY;
  return isToday ? "/dashboard" : `/dashboard?month=${m}&year=${y}`;
}

// ── Outer shell: resolves session immediately, streams loading skeleton ───────
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const { month: todayMonth, year: todayYear } = getCurrentMonthYear();
  const params = await searchParams;

  const targetMonth = params.month ? Math.min(12, Math.max(1, parseInt(params.month))) : todayMonth;
  const targetYear  = params.year  ? Math.max(2020, parseInt(params.year))            : todayYear;

  const prevM = targetMonth === 1  ? 12 : targetMonth - 1;
  const prevY = targetMonth === 1  ? targetYear - 1 : targetYear;
  const nextM = targetMonth === 12 ? 1  : targetMonth + 1;
  const nextY = targetMonth === 12 ? targetYear + 1 : targetYear;
  const prevUrl = monthNav(prevM, prevY, todayMonth, todayYear);
  const nextUrl = monthNav(nextM, nextY, todayMonth, todayYear);
  const isFuture = targetYear > todayYear || (targetYear === todayYear && targetMonth > todayMonth);

  // The Suspense boundary means the loading skeleton streams to the browser
  // immediately — DB queries run inside DashboardData without blocking the shell.
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardData
        userId={session.user.id}
        targetMonth={targetMonth}
        targetYear={targetYear}
        todayMonth={todayMonth}
        todayYear={todayYear}
        prevUrl={prevUrl}
        nextUrl={nextUrl}
        isFuture={isFuture}
      />
    </Suspense>
  );
}

// ── Inner data component: all DB queries live here ────────────────────────────
async function DashboardData({
  userId, targetMonth, targetYear, todayMonth, todayYear, prevUrl, nextUrl, isFuture,
}: {
  userId: string;
  targetMonth: number; targetYear: number;
  todayMonth: number;  todayYear: number;
  prevUrl: string; nextUrl: string;
  isFuture: boolean;
}) {
  // Account-level (not month-scoped), so fetched once here regardless of
  // which branch below renders — see gmail-reconnect-banner.tsx.
  const gmailConn = await db.gmailConnection.findUnique({
    where: { userId },
    select: { needsReauth: true, connectedAt: true },
  });
  const gmailReconnectDays = gmailConn ? (new Date().getTime() - gmailConn.connectedAt.getTime()) / (1000 * 60 * 60 * 24) : 0;
  const gmailStatus: "ok" | "reminder" | "broken" = !gmailConn
    ? "ok"
    : gmailConn.needsReauth
      ? "broken"
      : gmailReconnectDays >= 6
        ? "reminder"
        : "ok";

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

    const adHocIncomeInMonth = futureMonthRecord?.adHocItems
      .filter(i => i.type === "INCOME")
      .reduce((s, i) => s + i.amount, 0) ?? 0;

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

    return (
      <DashboardClient
        currentMonth={null}
        recentMonths={[]}
        ccTemplates={[]}
        customCategories={[]}
        subCategorySuggestions={[]}
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
        gmailStatus={gmailStatus}
      />
    );
  }

  // Old unpaid bills (any category except CC/LOAN/CHIT_FUND, which carry
  // forward or amortize on their own) are never copied into the new month
  // anymore — they stay payable against their real original entry, in
  // their real original month. Only worth surfacing on the actual current
  // month (paying something "as of now" only makes sense there, not while
  // browsing a past or projected month).
  const isRealCurrentMonth = targetMonth === todayMonth && targetYear === todayYear;

  // ── Actual (past or current) month ────────────────────────────────────────
  const [currentMonth, recentMonths, ccTemplates, allTemplates, customCategories, subCategorySuggestions, carriedOverEntries] = await Promise.all([
    db.month.findUnique({
      where: { userId_month_year: { userId, month: targetMonth, year: targetYear } },
      include: {
        entries: {
          include: { template: { include: { chitFund: true } } },
          orderBy: { template: { sortOrder: "asc" } },
        },
        adHocItems: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      },
    }),
    db.month.findMany({
      where: { userId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 6,
      select: {
        id: true, month: true, year: true,
        salaryIncome: true, freelanceIncome: true, otherIncome: true, openingBalance: true,
        entries: { select: { id: true, templateId: true, amount: true, cashbackAmount: true } },
        adHocItems: { select: { id: true, type: true, amount: true, category: true, customCategory: true, customCategoryId: true, subCategory: true, notes: true, ccTemplateId: true, isCredit: true, date: true } },
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
    db.customCategory.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Every distinct (parent category, sub-category name) pair this user
    // has used, so the add-expense form can scope its sub-category
    // suggestions to whichever category is currently selected instead of
    // offering a flat, unscoped list. orderBy date desc before distinct
    // means each distinct combo keeps its most-recent usage's position,
    // so the list comes back recent-first — used to power the category
    // picker's "Recent" section.
    db.adHocItem.findMany({
      where: { month: { userId }, subCategory: { not: null } },
      select: { category: true, customCategoryId: true, subCategory: true },
      distinct: ["category", "customCategoryId", "subCategory"],
      orderBy: { date: "desc" },
    }),
    isRealCurrentMonth
      ? db.monthlyEntry.findMany({
          where: {
            isPaid: false,
            template: { category: { notIn: ["CREDIT_CARD", "LOAN", "CHIT_FUND"] } },
            month: {
              userId,
              OR: [{ year: { lt: todayYear } }, { year: todayYear, month: { lt: todayMonth } }],
            },
          },
          select: {
            id: true, monthId: true, amount: true, cashbackAmount: true, paidAmount: true,
            template: { select: { name: true, category: true, customCategory: true, dueDateDay: true, statementDay: true } },
            month: { select: { month: true, year: true } },
          },
          orderBy: [{ month: { year: "asc" } }, { month: { month: "asc" } }],
        })
      : Promise.resolve([]),
  ]);

  // A brand-new account's very first month: skip the "enter your income to
  // start" prompt entirely. It's pure friction here (real dropoff, per user
  // feedback) and there are no templates yet to populate anyway, so it buys
  // nothing. Silently create the month with 0 income and land straight on
  // a normal, mostly-empty dashboard instead. recentMonths.length === 0
  // means no Month row has ever existed for this user, not just this one —
  // a returning user opening any other month still gets the normal
  // "Set Up This Month" prompt below.
  let resolvedMonth = currentMonth;
  if (!resolvedMonth && recentMonths.length === 0) {
    await setupMonth(userId, targetMonth, targetYear, 0);
    resolvedMonth = await db.month.findUnique({
      where: { userId_month_year: { userId, month: targetMonth, year: targetYear } },
      include: {
        entries: { include: { template: { include: { chitFund: true } } }, orderBy: { template: { sortOrder: "asc" } } },
        adHocItems: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      },
    });
  }

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

  return (
    <DashboardClient
      currentMonth={resolvedMonth ? JSON.parse(JSON.stringify(resolvedMonth)) : null}
      recentMonths={JSON.parse(JSON.stringify(recentMonths))}
      ccTemplates={JSON.parse(JSON.stringify(ccTemplates))}
      customCategories={customCategories}
      subCategorySuggestions={subCategorySuggestions}
      incomeTemplates={JSON.parse(JSON.stringify(incomeTemplates))}
      todayMonth={todayMonth}
      todayYear={todayYear}
      userId={userId}
      targetMonth={targetMonth}
      targetYear={targetYear}
      prevUrl={prevUrl}
      nextUrl={nextUrl}
      gmailStatus={gmailStatus}
      carriedOverEntries={JSON.parse(JSON.stringify(carriedOverEntries))}
    />
  );
}
