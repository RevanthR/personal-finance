import { getSession } from "@/lib/get-session";
import { getActiveTemplates } from "@/lib/cached-queries";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { YearOverviewClient, type MonthData } from "@/components/months/year-overview-client";

function getFY(month: number, year: number) {
  const fyStart = month >= 4 ? year : year - 1;
  return {
    fyStart,
    fyKey: `FY${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}`,
  };
}

export default async function MonthsPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayYear = now.getFullYear();
  const { fyStart, fyKey } = getFY(todayMonth, todayYear);
  const nextM = todayMonth === 12 ? 1  : todayMonth + 1;
  const nextY = todayMonth === 12 ? todayYear + 1 : todayYear;

  // All 12 months of the current FY: Apr(fyStart)→Mar(fyStart+1)
  const fyMonths = [
    ...Array.from({ length: 9 }, (_, i) => ({ month: i + 4, year: fyStart })),
    ...Array.from({ length: 3 }, (_, i) => ({ month: i + 1, year: fyStart + 1 })),
  ];

  const [allMonths, allTemplates, currentMonthFull, pendingReceivables] = await Promise.all([
    db.month.findMany({
      where: { userId },
      include: { entries: true, adHocItems: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    }),
    getActiveTemplates(userId),
    db.month.findUnique({
      where: { userId_month_year: { userId, month: todayMonth, year: todayYear } },
      include: {
        entries: { include: { template: true } },
        adHocItems: true,
      },
    }),
    db.receivable.findMany({
      where: { userId, status: "PENDING", expectedDate: { not: null } },
    }),
  ]);

  // CC statement amounts from current month — used to make the next-month projection more accurate
  // (statementAmount reflects actual post-close charges, not the template default)
  const ccStatements = new Map<string, number>();
  if (currentMonthFull?.isPopulated) {
    for (const e of currentMonthFull.entries) {
      if (e.template.category === "CREDIT_CARD" && e.statementAmount != null && e.statementAmount > 0) {
        ccStatements.set(e.templateId, e.statementAmount);
      }
    }
  }

  // templateType may be null for pre-existing rows (DB DEFAULT not backfilled by Prisma 7)
  // Use !== "INCOME" so null rows are treated as EXPENSE
  const incomeTemplates = allTemplates.filter(t => t.templateType === "INCOME");
  const expenseTemplates = allTemplates.filter(t => t.templateType !== "INCOME");

  // Base income: prefer income templates; fallback to most recent month's salary
  const recentMonth = [...allMonths]
    .filter(m => m.isPopulated)
    .sort((a, b) => b.year - a.year || b.month - a.month)[0];
  const fallbackIncome = recentMonth?.salaryIncome ?? 0;

  function getProjectedIncome(month: number, year: number): number {
    if (incomeTemplates.length === 0) return fallbackIncome;
    return incomeTemplates.reduce((sum, t) => {
      let amount = t.amount;
      if (t.pendingAmount != null && t.pendingFromMonth != null && t.pendingFromYear != null) {
        const kicks = year > t.pendingFromYear ||
          (year === t.pendingFromYear && month >= t.pendingFromMonth);
        if (kicks) amount = t.pendingAmount;
      }
      return sum + amount;
    }, 0);
  }

  // Compute which future months have an income step-change from a pending template amount.
  // Key format: "YEAR-MONTH"
  const incomeChangeMonths = new Set<string>();
  for (const t of incomeTemplates) {
    if (t.pendingAmount != null && t.pendingFromMonth != null && t.pendingFromYear != null) {
      incomeChangeMonths.add(`${t.pendingFromYear}-${t.pendingFromMonth}`);
    }
  }

  // Returns false if a template has ended before the given projected month
  function isTemplateActiveInMonth(
    t: (typeof allTemplates)[number],
    projMonth: number,
    projYear: number,
  ): boolean {
    if (t.endsOnYear != null && t.endsOnMonth != null) {
      if (projYear > t.endsOnYear) return false;
      if (projYear === t.endsOnYear && projMonth > t.endsOnMonth) return false;
    }
    return true;
  }

  // Current FY months (actual or projected)
  const currentFYMonths: MonthData[] = fyMonths.map(({ month, year }) => {
    const actual = allMonths.find(m => m.month === month && m.year === year && m.isPopulated);
    if (actual) {
      const income = actual.salaryIncome + actual.freelanceIncome + actual.otherIncome
        + actual.adHocItems.filter(i => i.type === "INCOME").reduce((s, i) => s + i.amount, 0);
      const expenses = actual.entries.reduce((s, e) => s + e.amount, 0)
        + actual.adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").reduce((s, i) => s + i.amount, 0);
      return {
        id: actual.id, month, year, income, expenses,
        balance: income - expenses,
        paid: actual.entries.filter(e => e.isPaid).length,
        total: actual.entries.length,
        isPopulated: true,
        isCurrent: month === todayMonth && year === todayYear,
        hasIncomeChange: false,
        endingTemplateNames: [],
      };
    }
    // Projected: sum active expense templates that haven't ended yet
    const activeThisMonth = expenseTemplates.filter(t =>
      (t.frequency === "MONTHLY" || (t.frequency === "YEARLY" && t.dueMonth === month)) &&
      isTemplateActiveInMonth(t, month, year)
    );
    const isImmediateNext = month === nextM && year === nextY;
    const projExpenses = activeThisMonth.reduce((s, t) => {
      let amount = t.amount;
      if (t.chitFund) {
        amount = t.chitFund.isLifted
          ? (t.chitFund.monthlyLiftedAmount ?? t.amount)
          : t.chitFund.monthlyUnliftedAmount;
      } else if (t.category === "CREDIT_CARD" && isImmediateNext && ccStatements.has(t.id)) {
        amount = ccStatements.get(t.id)!;
      }
      return s + amount;
    }, 0);
    // Pending receivables whose expectedDate falls in this projected month
    const receivableIncome = pendingReceivables
      .filter((r) => {
        if (!r.expectedDate) return false;
        const d = new Date(r.expectedDate);
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      })
      .reduce((s, r) => s + r.expectedAmount, 0);

    // AdHocItems already recorded in a not-yet-populated month record (e.g. received receivables)
    const nonPopMonth = allMonths.find(m => m.month === month && m.year === year && !m.isPopulated);
    const existingAdHocIncome = nonPopMonth
      ? nonPopMonth.adHocItems.filter(i => i.type === "INCOME").reduce((s, i) => s + i.amount, 0)
      : 0;

    const projIncome = getProjectedIncome(month, year) + receivableIncome + existingAdHocIncome;

    // Templates that were active last month but not this month
    const prevM = month === 1 ? 12 : month - 1;
    const prevY = month === 1 ? year - 1 : year;
    const endingTemplateNames = expenseTemplates
      .filter(t => t.frequency === "MONTHLY")
      .filter(t => isTemplateActiveInMonth(t, prevM, prevY) && !isTemplateActiveInMonth(t, month, year))
      .map(t => t.name);

    return {
      id: null, month, year,
      income: projIncome, expenses: projExpenses,
      balance: projIncome - projExpenses,
      paid: null, total: null,
      isPopulated: false,
      isCurrent: month === todayMonth && year === todayYear,
      hasIncomeChange: incomeChangeMonths.has(`${year}-${month}`),
      endingTemplateNames,
    };
  });

  // Past FY summaries
  const pastFYMap: Record<string, { income: number; expenses: number; count: number }> = {};
  for (const m of allMonths) {
    const { fyStart: mFYStart, fyKey: mFY } = getFY(m.month, m.year);
    if (mFYStart === fyStart) continue; // skip current FY
    if (!pastFYMap[mFY]) pastFYMap[mFY] = { income: 0, expenses: 0, count: 0 };
    const income = m.salaryIncome + m.freelanceIncome + m.otherIncome
      + m.adHocItems.filter(i => i.type === "INCOME").reduce((s, i) => s + i.amount, 0);
    const expenses = m.entries.reduce((s, e) => s + e.amount, 0)
      + m.adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").reduce((s, i) => s + i.amount, 0);
    pastFYMap[mFY].income += income;
    pastFYMap[mFY].expenses += expenses;
    pastFYMap[mFY].count++;
  }
  const pastFYSummaries = Object.entries(pastFYMap)
    .map(([fy, d]) => ({ fy, ...d, balance: d.income - d.expenses }))
    .sort((a, b) => b.fy.localeCompare(a.fy));

  // Current month insights (null if month not set up yet)
  type InsightData = {
    categoryBreakdown: { key: string; name: string; value: number; color: string }[];
    ccSubcatBreakdown: { name: string; amount: number }[];
    savingsRate: number;
    totalIncome: number;
    totalExpenses: number;
    upcomingPayments: { name: string; amount: number; dueDay: number; overdue: boolean }[];
  } | null;

  let currentMonthInsights: InsightData = null;
  if (currentMonthFull?.isPopulated) {
    const cm = currentMonthFull;
    const cmIncome = cm.salaryIncome + cm.freelanceIncome + cm.otherIncome
      + cm.adHocItems.filter(i => i.type === "INCOME").reduce((s, i) => s + i.amount, 0);
    const cmExpenses = cm.entries.reduce((s, e) => s + e.amount, 0)
      + cm.adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").reduce((s, i) => s + i.amount, 0);

    // Category breakdown — entries grouped by template.category
    const catMap = new Map<string, number>();
    for (const e of cm.entries) {
      const cat = e.template.customCategory ?? e.template.category;
      catMap.set(cat, (catMap.get(cat) ?? 0) + e.amount);
    }
    for (const a of cm.adHocItems) {
      if (a.type === "EXPENSE" && a.category !== "CREDIT_CARD") {
        const cat = a.category ?? "MISCELLANEOUS";
        catMap.set(cat, (catMap.get(cat) ?? 0) + a.amount);
      }
    }
    const COLORS: Record<string, string> = {
      HOUSE_MAINTENANCE: "#fb923c", LOAN: "#f87171", CHIT_FUND: "#a78bfa",
      CREDIT_CARD: "#60a5fa", SAVINGS: "#34d399", PERSONAL: "#f472b6",
      MISCELLANEOUS: "#94a3b8",
    };
    const categoryBreakdown = [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, value]) => ({
        key,
        name: key.split("_").map(w => w[0] + w.slice(1).toLowerCase()).join(" "),
        value,
        color: COLORS[key] ?? "#94a3b8",
      }));

    // CC sub-category breakdown from adHocItems notes ("CardName · Subcategory")
    const ccMap = new Map<string, number>();
    for (const a of cm.adHocItems) {
      if (a.type === "EXPENSE" && a.category === "CREDIT_CARD" && a.notes) {
        const parts = a.notes.split("·");
        const subcat = parts.length > 1 ? parts[1].trim() : "Other";
        ccMap.set(subcat, (ccMap.get(subcat) ?? 0) + a.amount);
      }
    }
    const ccSubcatBreakdown = [...ccMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount }));

    // Upcoming unpaid entries with due dates
    const today = todayMonth;
    const upcomingPayments = cm.entries
      .filter(e => !e.isPaid && e.template.dueDateDay != null)
      .map(e => ({
        name: e.template.name,
        amount: e.amount,
        dueDay: e.template.dueDateDay!,
        overdue: e.template.dueDateDay! < today,
      }))
      .sort((a, b) => a.dueDay - b.dueDay)
      .slice(0, 6);

    currentMonthInsights = {
      categoryBreakdown,
      ccSubcatBreakdown,
      savingsRate: cmIncome > 0 ? Math.round(((cmIncome - cmExpenses) / cmIncome) * 100) : 0,
      totalIncome: cmIncome,
      totalExpenses: cmExpenses,
      upcomingPayments,
    };
  }

  return (
    <YearOverviewClient
      months={JSON.parse(JSON.stringify(currentFYMonths))}
      fyKey={fyKey}
      pastFYSummaries={pastFYSummaries}
      incomeTemplateCount={incomeTemplates.length}
      currentMonthInsights={JSON.parse(JSON.stringify(currentMonthInsights))}
    />
  );
}
