import { auth } from "@/lib/auth";
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
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayYear = now.getFullYear();
  const { fyStart, fyKey } = getFY(todayMonth, todayYear);

  // All 12 months of the current FY: Apr(fyStart)→Mar(fyStart+1)
  const fyMonths = [
    ...Array.from({ length: 9 }, (_, i) => ({ month: i + 4, year: fyStart })),
    ...Array.from({ length: 3 }, (_, i) => ({ month: i + 1, year: fyStart + 1 })),
  ];

  const [allMonths, allTemplates] = await Promise.all([
    db.month.findMany({
      where: { userId },
      include: { entries: true, adHocItems: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    }),
    db.lineItemTemplate.findMany({
      where: { userId, isActive: true, foreClosedOn: null },
    }),
  ]);

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
      };
    }
    // Projected: sum active expense templates + any yearly template due this month
    const projExpenses = expenseTemplates
      .filter(t => t.frequency === "MONTHLY" || (t.frequency === "YEARLY" && t.dueMonth === month))
      .reduce((s, t) => s + t.amount, 0);
    const projIncome = getProjectedIncome(month, year);
    return {
      id: null, month, year,
      income: projIncome, expenses: projExpenses,
      balance: projIncome - projExpenses,
      paid: null, total: null,
      isPopulated: false,
      isCurrent: month === todayMonth && year === todayYear,
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

  return (
    <YearOverviewClient
      months={JSON.parse(JSON.stringify(currentFYMonths))}
      fyKey={fyKey}
      pastFYSummaries={pastFYSummaries}
    />
  );
}
