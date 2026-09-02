import { getSession } from "@/lib/get-session";
import { getActiveTemplates } from "@/lib/cached-queries";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { isTemplateActiveInMonth, computeLoanAmortization, computeLoanEndDate, type LoanAmortization } from "@/lib/loan-utils";
import { chitMonthlyAmount } from "@/lib/entry-amount";
import { getCardCycleExpenseByMonth } from "@/lib/cards-db";
import { computeMonthIncome, effectiveEntryAmount, cashEntryAmount, isBillPending, isPastDueDate, netAmount, effectivePaid, type EntryBase } from "@/lib/finance-utils";

const isCC = (e: { template: { category: string } }) => e.template.category === "CREDIT_CARD";
import { YearOverviewClient, type MonthData } from "@/components/months/year-overview-client";
import { CATEGORY_LABELS, CATEGORY_COLORS, MONTHS, pendingAmountKicks, getCurrentMonthYear, prevMonthYear } from "@/lib/utils";
import type { AnalyticsData } from "@/components/months/stats-breakdown";
import { clusterByName } from "@/lib/gmail/text-similarity";

// Category breakdown of one month's income — mirrors computeMonthIncome's
// override/pending-promotion logic (finance-utils.ts) per category instead
// of collapsing straight to one total, so the FY summary can show a real
// salary/freelance/other/one-off split instead of attributing all income
// to "salary".
function computeMonthIncomeByCategory(
  adHocItems: { type: string; amount: number; notes: string | null }[],
  templates: { id: string; category: string; amount: number; pendingAmount: number | null; pendingFromMonth: number | null; pendingFromYear: number | null }[],
  month: number,
  year: number,
): { salary: number; freelance: number; other: number; adHoc: number } {
  const overrides = new Map<string, number>();
  let adHoc = 0;
  for (const item of adHocItems) {
    if (item.type !== "INCOME") continue;
    if (item.notes?.startsWith("income_override:")) {
      overrides.set(item.notes.slice("income_override:".length), item.amount);
    } else {
      adHoc += item.amount;
    }
  }
  let salary = 0, freelance = 0, other = 0;
  for (const t of templates) {
    const amount = overrides.has(t.id) ? overrides.get(t.id)! : (pendingAmountKicks(t, month, year) ? t.pendingAmount! : t.amount);
    if (t.category === "SALARY") salary += amount;
    else if (t.category === "FREELANCE") freelance += amount;
    else other += amount;
  }
  return { salary, freelance, other, adHoc };
}

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

  const { month: todayMonth, year: todayYear } = getCurrentMonthYear();
  const { fyStart, fyKey } = getFY(todayMonth, todayYear);

  // All 12 months of the current FY: Apr(fyStart)→Mar(fyStart+1)
  const fyMonths = [
    ...Array.from({ length: 9 }, (_, i) => ({ month: i + 4, year: fyStart })),
    ...Array.from({ length: 3 }, (_, i) => ({ month: i + 1, year: fyStart + 1 })),
  ];

  // currentMonthFull and analyticsMonths were previously two more queries
  // here, each with the exact same include shape and orderBy as allMonths
  // (analyticsMonths just adds isPopulated: true, currentMonthFull just
  // narrows to one month/year) — both are strict subsets of allMonths and
  // are now derived from it below instead of refetched.
  const [allMonths, allTemplates, pendingReceivables, foreclosures] = await Promise.all([
    db.month.findMany({
      where: { userId },
      include: { entries: { include: { template: true } }, adHocItems: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    }),
    getActiveTemplates(userId),
    db.receivable.findMany({
      where: { userId, status: "PENDING", expectedDate: { not: null } },
    }),
    // A foreclosure's lump sum is a real cash outflow (stays in Expenses
    // and the Cash balance) but a one-off, not a spending pattern — kept
    // separate here so the Monthly Breakdown can flag which month it hit,
    // and the savings-rate trend below can compare like-for-like months
    // instead of reading a deliberate early payoff as a bad month.
    db.lineItemTemplate.findMany({
      where: { userId, foreClosedOn: { not: null } },
      select: { foreClosedOn: true, foreCloseAmount: true },
    }),
  ]);

  const foreclosureByMonthKey = new Map<string, number>();
  for (const f of foreclosures) {
    if (!f.foreClosedOn || !f.foreCloseAmount) continue;
    const key = `${f.foreClosedOn.getUTCFullYear()}-${f.foreClosedOn.getUTCMonth() + 1}`;
    foreclosureByMonthKey.set(key, (foreclosureByMonthKey.get(key) ?? 0) + f.foreCloseAmount);
  }

  // Credit-card cost per calendar month comes from CardStatement now, not
  // the MonthlyEntry the FY grid used to read. A card's cost in month M is
  // the statement cut in M (confirmed figure, or the cycle's charge sum).
  const { byMonth: ccByMonth, projectedMonthly: ccProjectedMonthly } = await getCardCycleExpenseByMonth(userId);
  const ccFor = (m: number, y: number) => ccByMonth.get(`${y}-${m}`) ?? { total: 0, byCard: [] as { templateId: string; name: string; amount: number }[] };

  const currentMonthFull = allMonths.find(m => m.month === todayMonth && m.year === todayYear) ?? null;
  const analyticsMonths = allMonths.filter(m => m.isPopulated);

  // CC statement amounts from current month — used to make the next-month projection more accurate
  const todayDay = new Date().getDate();
  // Credit cards are handled separately (ccByMonth, above), so they
  // contribute 0 through these per-entry helpers — every `m.entries` sum
  // below is non-CC, and the card cost is added back where the total needs it.
  function entryExpense(e: EntryBase, isCurrentM: boolean): number {
    return isCC(e) ? 0 : effectiveEntryAmount(e, isCurrentM, todayDay);
  }
  function entryCash(e: EntryBase, isCurrentM: boolean): number {
    return isCC(e) ? 0 : cashEntryAmount(e, isCurrentM, todayDay);
  }
  function entryNet(e: { template: { category: string }; amount: number; cashbackAmount: number | null }): number {
    return isCC(e) ? 0 : netAmount(e);
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
      const amount = pendingAmountKicks(t, month, year) ? t.pendingAmount! : t.amount;
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

  // Current FY months (actual or projected)
  const currentFYMonths: MonthData[] = fyMonths.map(({ month, year }) => {
    const actual = allMonths.find(m => m.month === month && m.year === year && m.isPopulated);
    if (actual) {
      const isCurrentM = month === todayMonth && year === todayYear;
      const income = computeMonthIncome(actual.adHocItems, incomeTemplates, month, year, actual.salaryIncome);
      const cc = ccFor(month, year);
      const nonCcEntries = actual.entries.filter(e => !isCC(e));
      const expenses = nonCcEntries.reduce((s, e) => s + entryExpense(e, isCurrentM), 0)
        + actual.adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0)
        + cc.total;
      // Cash view for the year's ending balance. A card statement counts as
      // cash out in the month it was cut (close enough for an FY-level
      // ending balance; the exact pay date is tracked per statement).
      const cashExpenses = nonCcEntries.reduce((s, e) => s + entryCash(e, isCurrentM), 0)
        + actual.adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0)
        + cc.total;
      return {
        id: actual.id, month, year, income, expenses, cashExpenses, ccTotal: cc.total, ccByCard: cc.byCard,
        balance: income - expenses,
        paid: nonCcEntries.filter(e => e.isPaid).length,
        total: nonCcEntries.length,
        isPopulated: true,
        isCurrent: month === todayMonth && year === todayYear,
        hasIncomeChange: false,
        endingTemplateNames: [],
        foreclosureAmount: foreclosureByMonthKey.get(`${year}-${month}`) ?? 0,
      };
    }
    // Projected: sum active non-CC expense templates; CC projects from a
    // 3-month rolling average of the cards' recent statements.
    const activeThisMonth = expenseTemplates.filter(t =>
      t.category !== "CREDIT_CARD" &&
      (t.frequency === "MONTHLY" || (t.frequency === "YEARLY" && t.dueMonth === month)) &&
      isTemplateActiveInMonth(t, month, year)
    );
    const projCCTotal = ccProjectedMonthly;
    const projCCByCard: { templateId: string; name: string; amount: number }[] = [];
    const projExpenses = activeThisMonth.reduce((s, t) => {
      return s + (t.chitFund ? chitMonthlyAmount(t.chitFund, t.amount) : t.amount);
    }, 0) + projCCTotal;
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
    const { month: prevM, year: prevY } = prevMonthYear(month, year);
    const endingTemplateNames = expenseTemplates
      .filter(t => t.frequency === "MONTHLY")
      .filter(t => isTemplateActiveInMonth(t, prevM, prevY) && !isTemplateActiveInMonth(t, month, year))
      .map(t => t.name);

    return {
      id: null, month, year,
      income: projIncome, expenses: projExpenses, cashExpenses: projExpenses, ccTotal: projCCTotal, ccByCard: projCCByCard,
      balance: projIncome - projExpenses,
      paid: null, total: null,
      isPopulated: false,
      isCurrent: month === todayMonth && year === todayYear,
      hasIncomeChange: incomeChangeMonths.has(`${year}-${month}`),
      endingTemplateNames,
      foreclosureAmount: foreclosureByMonthKey.get(`${year}-${month}`) ?? 0,
    };
  });

  // Past FY summaries
  const pastFYMap: Record<string, { income: number; expenses: number; count: number }> = {};
  for (const m of allMonths) {
    const { fyStart: mFYStart, fyKey: mFY } = getFY(m.month, m.year);
    if (mFYStart === fyStart) continue; // skip current FY
    if (!pastFYMap[mFY]) pastFYMap[mFY] = { income: 0, expenses: 0, count: 0 };
    const income = computeMonthIncome(m.adHocItems, incomeTemplates, m.month, m.year, m.salaryIncome);
    const expenses = m.entries.reduce((s, e) => s + entryNet(e), 0)
      + m.adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0)
      + ccFor(m.month, m.year).total;
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
    cardUsage: { name: string; amount: number; creditLimit: number | null }[];
    savingsRate: number;
    totalIncome: number;
    totalExpenses: number;
    upcomingPayments: { name: string; amount: number; dueDay: number; overdue: boolean }[];
  } | null;

  let currentMonthInsights: InsightData = null;
  if (currentMonthFull?.isPopulated) {
    const cm = currentMonthFull;
    const cmIncome = computeMonthIncome(cm.adHocItems, incomeTemplates, cm.month, cm.year, cm.salaryIncome);
    const cmExpenses = cm.entries.reduce((s, e) => s + entryExpense(e, true), 0)
      + cm.adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0);

    // Category breakdown — entries grouped by template.category (a pending
    // CC bill contributes nothing here, same as the Expenditure tile,
    // until its statement closes)
    const catMap = new Map<string, number>();
    for (const e of cm.entries) {
      const amt = entryExpense(e, true);
      if (amt === 0) continue;
      const cat = e.template.customCategory ?? e.template.category;
      catMap.set(cat, (catMap.get(cat) ?? 0) + amt);
    }
    for (const a of cm.adHocItems) {
      if (a.type === "EXPENSE" && !a.ccTemplateId) {
        const cat = a.customCategory ?? a.category ?? "MISCELLANEOUS";
        catMap.set(cat, (catMap.get(cat) ?? 0) + a.amount);
      }
    }
    const categoryBreakdown = [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, value]) => ({
        key,
        name: key.split("_").map(w => w[0] + w.slice(1).toLowerCase()).join(" "),
        value,
        color: CATEGORY_COLORS[key] ?? "#94a3b8",
      }));

    // CC sub-category breakdown from adHocItems — a repayment has no
    // sub-category and isn't spend at all (see isCardRepayment), so it's
    // excluded rather than dumped into "Other"; a genuine refund still
    // nets OUT of its sub-category's total instead of adding to it.
    const ccMap = new Map<string, number>();
    for (const a of cm.adHocItems) {
      if (a.type === "EXPENSE" && a.ccTemplateId && !a.isCardRepayment) {
        const subcat = a.subCategory ?? "Other";
        ccMap.set(subcat, (ccMap.get(subcat) ?? 0) + (a.isCredit ? -a.amount : a.amount));
      }
    }
    const ccSubcatBreakdown = [...ccMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount }));

    // Which card was actually swiped most this month — straight from the
    // underlying transactions (same source as ccSubcatBreakdown above),
    // not the statement-cycle amount/billedAmount split. entryExpense
    // reports 0 for a card whose statement hasn't closed yet (correct for
    // Expenditure, which shouldn't count an unclosed bill as committed
    // spend), which made a heavily-used-but-not-yet-closed card show 0%
    // usage while whichever card happened to already be closed looked like
    // 100% — "usage" means real spend, not billing-cycle status.
    const cardNameById = new Map(
      cm.entries.filter(e => e.template.category === "CREDIT_CARD").map(e => [e.templateId, e.template.name])
    );
    const cardLimitByName = new Map(
      cm.entries.filter(e => e.template.category === "CREDIT_CARD").map(e => [e.template.name, e.template.creditLimit ?? null])
    );
    const cardMap = new Map<string, number>();
    for (const a of cm.adHocItems) {
      // A repayment isn't usage of the card, it's paying it down — leaving
      // it in here would drag a heavily-used card's total down (or negative)
      // by however much got paid off, understating real usage.
      if (a.type === "EXPENSE" && a.ccTemplateId && !a.isCardRepayment) {
        const name = cardNameById.get(a.ccTemplateId) ?? "Card";
        cardMap.set(name, (cardMap.get(name) ?? 0) + (a.isCredit ? -a.amount : a.amount));
      }
    }
    const cardUsage = [...cardMap.entries()]
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount, creditLimit: cardLimitByName.get(name) ?? null }));

    // Upcoming unpaid entries with due dates (exclude pending CC bills).
    // Payment Due Date can wrap into next month relative to this entry's
    // own month (Bill Generation Date > Payment Due Date — see
    // isPastDueDate) — a card that generates the 15th and is due the 5th
    // isn't overdue for the whole back half of this month, only after that
    // 5th actually arrives, next month.
    const upcomingPayments = cm.entries
      .filter(e => !e.isPaid && e.template.dueDateDay != null && !isBillPending(e, true, todayDay))
      .map(e => ({
        name: e.template.name,
        amount: netAmount(e) - effectivePaid(e),
        dueDay: e.template.dueDateDay!,
        overdue: isPastDueDate(cm.month, cm.year, e.template.statementDay, e.template.dueDateDay!, todayMonth, todayYear, todayDay),
      }))
      .sort((a, b) => a.dueDay - b.dueDay)
      .slice(0, 6);

    currentMonthInsights = {
      categoryBreakdown,
      ccSubcatBreakdown,
      cardUsage,
      savingsRate: cmIncome > 0 ? Math.round(((cmIncome - cmExpenses) / cmIncome) * 100) : 0,
      totalIncome: cmIncome,
      totalExpenses: cmExpenses,
      upcomingPayments,
    };
  }

  // ── Analytics computation ────────────────────────────────────────
  const fyActual = analyticsMonths.filter(m => {
    const { fyStart: mFYStart } = getFY(m.month, m.year);
    return mFYStart === fyStart;
  });

  // Per-template totals across current FY actual months
  type TEntry = { name: string; category: string; customCategory: string | null; total: number; months: number };
  const templateMap = new Map<string, TEntry>();
  let recurringTotal = 0;
  let adHocExpenseTotal = 0;
  for (const m of fyActual) {
    const isCurrentM = m.month === todayMonth && m.year === todayYear;
    for (const e of m.entries) {
      if (isCurrentM && isBillPending(e, true, todayDay)) continue;
      const netAmt = entryExpense(e, isCurrentM);
      const t = e.template;
      const ex = templateMap.get(e.templateId);
      if (ex) { ex.total += netAmt; ex.months++; }
      else templateMap.set(e.templateId, { name: t.name, category: t.category, customCategory: t.customCategory ?? null, total: netAmt, months: 1 });
      recurringTotal += netAmt;
    }
    for (const a of m.adHocItems) {
      if (a.type === "EXPENSE" && !a.ccTemplateId) adHocExpenseTotal += a.amount;
    }
  }
  // Card statements cut in the current FY's actual months.
  const fyCcTotal = Math.round(fyActual.reduce((s, m) => s + ccFor(m.month, m.year).total, 0));
  const fyExpenses = recurringTotal + adHocExpenseTotal + fyCcTotal;
  const fyIncomeTotal = fyActual.reduce((s, m) => s + computeMonthIncome(m.adHocItems, incomeTemplates, m.month, m.year, m.salaryIncome), 0);
  // Full-year total including projected (not-yet-populated) months — same
  // basis as the Overview tab's total, so the two tabs no longer disagree.
  const fyExpensesProjected = currentFYMonths.reduce((s, m) => s + m.expenses, 0);
  const fyIncomeProjected = currentFYMonths.reduce((s, m) => s + m.income, 0);

  // Group templates by category, add ad-hoc items per category
  const catMap = new Map<string, { total: number; items: TEntry[] }>();
  for (const [, t] of templateMap) {
    const key = t.customCategory ?? t.category;
    const ex = catMap.get(key);
    if (ex) { ex.total += t.total; ex.items.push(t); }
    else catMap.set(key, { total: t.total, items: [t] });
  }
  for (const m of fyActual) {
    for (const a of m.adHocItems) {
      if (a.type === "EXPENSE" && !a.ccTemplateId) {
        const key = a.customCategory ?? a.category ?? "MISCELLANEOUS";
        const ex = catMap.get(key);
        if (ex) ex.total += a.amount;
        else catMap.set(key, { total: a.amount, items: [] });
      }
    }
  }
  if (fyCcTotal > 0) {
    const cardItems: TEntry[] = [];
    const perCard = new Map<string, TEntry>();
    for (const m of fyActual) for (const c of ccFor(m.month, m.year).byCard) {
      const ex = perCard.get(c.templateId);
      if (ex) { ex.total += c.amount; ex.months++; }
      else perCard.set(c.templateId, { name: c.name, category: "CREDIT_CARD", customCategory: null, total: c.amount, months: 1 });
    }
    cardItems.push(...perCard.values());
    catMap.set("CREDIT_CARD", { total: fyCcTotal, items: cardItems });
  }
  const spendByCategory = [...catMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([key, d]) => ({
      key,
      name: CATEGORY_LABELS[key] ?? key,
      color: CATEGORY_COLORS[key] ?? "#9ca3af",
      total: d.total,
      pct: fyExpenses > 0 ? Math.round((d.total / fyExpenses) * 100) : 0,
      items: d.items.sort((a, b) => b.total - a.total).map(t => ({
        name: t.name,
        total: t.total,
        months: t.months,
      })),
    }));

  // Top merchants — every one-off expense across the year (cash/UPI and
  // card alike, not just the non-CC subset catMap above uses), fuzzy-
  // grouped by name so "Swiggy"/"SWIGGY*BANGALORE"/"Swiggy Order #4471"
  // land in one bucket instead of fragmenting into near-duplicates.
  const merchantItems = fyActual.flatMap(m =>
    m.adHocItems.filter(a => a.type === "EXPENSE" && !a.isCredit)
  );
  const topMerchants = clusterByName(merchantItems, a => a.name, a => a.amount)
    .slice(0, 8);

  // Spending character — use catMap so adhoc is included and Essential+Lifestyle = fyExpenses
  const ESSENTIAL_CATS = new Set(["LOAN", "HOUSE_MAINTENANCE", "SAVINGS"]);
  let essentialTotal = 0, lifestyleTotal = 0;
  for (const [key, d] of catMap) {
    if (ESSENTIAL_CATS.has(key)) essentialTotal += d.total;
    else lifestyleTotal += d.total;
  }
  // Committed overhead = sum of active FIXED expense templates
  const committedOverhead = expenseTemplates
    .filter(t => t.isFixed)
    .reduce((s, t) => s + t.amount, 0);

  // Monthly trends
  const monthlyTrends = fyActual.map(m => {
    const isCurrentM = m.month === todayMonth && m.year === todayYear;
    const income = computeMonthIncome(m.adHocItems, incomeTemplates, m.month, m.year, m.salaryIncome);
    const expenses = m.entries
      .reduce((s, e) => s + entryExpense(e, isCurrentM), 0)
      + m.adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0)
      + ccFor(m.month, m.year).total;
    return {
      label: MONTHS[m.month - 1],
      income,
      expenses,
      balance: income - expenses,
      savingsRate: income > 0 ? Math.round(((income - expenses) / income) * 100) : 0,
      salary: income,
      freelance: 0,
      other: 0,
      adHocIncome: 0,
    };
  });

  // Loan freedom
  const now2 = new Date();
  const todayM2 = now2.getUTCMonth() + 1, todayY2 = now2.getUTCFullYear();
  function loanStartsAfter(t: { loanStartDate: Date | string | null }, month: number, year: number): boolean {
    if (!t.loanStartDate) return false;
    const start = new Date(t.loanStartDate);
    return year < start.getUTCFullYear() || (year === start.getUTCFullYear() && month < start.getUTCMonth() + 1);
  }
  const loans = allTemplates
    .filter(t => {
      if (t.category !== "LOAN" || t.templateType === "INCOME" || !t.isActive || t.foreClosedOn) return false;
      // A loan already paid off by the amortization math is excluded (same
      // shared eligibility rule as everywhere else); one that hasn't
      // started yet is kept, shown separately below as "upcoming" instead
      // of with live amortization figures that wouldn't mean anything yet.
      return loanStartsAfter(t, todayM2, todayY2) || isTemplateActiveInMonth(t, todayM2, todayY2);
    })
    .map(t => {
      const notStartedYet = loanStartsAfter(t, todayM2, todayY2);
      const startDate = t.loanStartDate ? new Date(t.loanStartDate) : null;
      let remainingMonths: number | null = null, totalRemaining: number | null = null;
      if (t.endsOnMonth && t.endsOnYear) {
        remainingMonths = Math.max(0, (t.endsOnYear - todayY2) * 12 + (t.endsOnMonth - todayM2));
        totalRemaining = remainingMonths * t.amount;
      }
      // Live this-month principal/interest split — skipped entirely for a
      // not-yet-started loan, since "months elapsed" would otherwise clamp
      // to 0 and report figures as if payments had already begun.
      let amortization: LoanAmortization | null = null;
      if (!notStartedYet && t.loanInterestRate != null) {
        amortization = computeLoanAmortization({
          emi: t.amount, annualRate: t.loanInterestRate, originalPrincipal: t.loanOriginalPrincipal,
          startDate: t.loanStartDate, outstandingOverride: t.loanOutstandingOverride, today: now2,
        });
      }
      // End date is resolved separately from the live figures above — a
      // not-yet-started loan still needs a projected payoff date to be
      // trackable in the relief timeline, it just can't show today's
      // principal/interest split before payments begin.
      let finalEndsMonth = t.endsOnMonth ?? null;
      let finalEndsYear = t.endsOnYear ?? null;
      let isProjectedFullTenure = false;
      if (amortization && amortization.monthsRemaining > 0) {
        const end = computeLoanEndDate({
          emi: t.amount, annualRate: t.loanInterestRate!, originalPrincipal: t.loanOriginalPrincipal,
          startDate: t.loanStartDate, outstandingOverride: t.loanOutstandingOverride, asOf: now2,
        });
        if (end) {
          finalEndsMonth = end.month; finalEndsYear = end.year;
          remainingMonths = amortization.monthsRemaining;
          totalRemaining = amortization.monthsRemaining * t.amount;
        }
      } else if (notStartedYet && t.loanInterestRate != null && t.loanOriginalPrincipal != null && startDate) {
        // Not started yet, but has full loan detail — project the full
        // tenure from the loan's own start date (k=0 there), not from
        // today, which would understate months-remaining by however far
        // away the start date is.
        const tenureAmort = computeLoanAmortization({
          emi: t.amount, annualRate: t.loanInterestRate, originalPrincipal: t.loanOriginalPrincipal,
          startDate: t.loanStartDate, today: startDate,
        });
        const end = computeLoanEndDate({
          emi: t.amount, annualRate: t.loanInterestRate, originalPrincipal: t.loanOriginalPrincipal,
          startDate: t.loanStartDate, asOf: startDate,
        });
        if (end && tenureAmort) {
          finalEndsMonth = end.month; finalEndsYear = end.year;
          isProjectedFullTenure = true;
          remainingMonths = tenureAmort.monthsRemaining;
          totalRemaining = tenureAmort.monthsRemaining * t.amount;
        }
      }
      const isOpenEnded = finalEndsMonth == null || finalEndsYear == null;
      const missingAmortizationInputs: string[] = [];
      if (t.loanInterestRate == null) missingAmortizationInputs.push("interest rate");
      if (t.loanOriginalPrincipal == null) missingAmortizationInputs.push("original principal");
      if (t.loanStartDate == null) missingAmortizationInputs.push("start date");
      const openEndedReason: "no_data" | "incomplete_data" | null = !isOpenEnded
        ? null
        : missingAmortizationInputs.length === 3 ? "no_data" : "incomplete_data";
      return {
        name: t.name, monthlyAmount: t.amount,
        endsMonth: finalEndsMonth, endsYear: finalEndsYear,
        remainingMonths, totalRemaining,
        interestRate: t.loanInterestRate ?? null,
        rateType: t.loanRateType ?? null,
        amortization,
        startsMonth: notStartedYet && startDate ? startDate.getUTCMonth() + 1 : null,
        startsYear: notStartedYet && startDate ? startDate.getUTCFullYear() : null,
        isOpenEnded, openEndedReason, missingAmortizationInputs, isProjectedFullTenure,
      };
    });

  // Chit fund summary — compute end date from startDate + durationMonths
  const chits = allTemplates
    .filter(t => t.category === "CHIT_FUND" && t.chitFund)
    .map(t => {
      const cf = t.chitFund!;
      // Use stored endDate if available (most accurate); fall back to computation.
      // Always use UTC methods to avoid timezone shifts on the server.
      let endsMonth: number, endsYear: number;
      if (cf.endDate) {
        const end = new Date(cf.endDate);
        endsMonth = end.getUTCMonth() + 1;
        endsYear = end.getUTCFullYear();
      } else {
        const end = new Date(cf.startDate);
        end.setUTCMonth(end.getUTCMonth() + cf.durationMonths - 1);
        endsMonth = end.getUTCMonth() + 1;
        endsYear = end.getUTCFullYear();
      }
      const monthlyAmount = chitMonthlyAmount(cf, t.amount);
      const remainingMonths = Math.max(0, (endsYear - todayY2) * 12 + (endsMonth - todayM2));
      return {
        name: t.name,
        monthlyAmount,
        totalValue: cf.totalValue,
        isLifted: cf.isLifted,
        endsMonth,
        endsYear,
        remainingMonths,
        durationMonths: cf.durationMonths,
        startYear: new Date(cf.startDate).getUTCFullYear(),
        startMonth: new Date(cf.startDate).getUTCMonth() + 1,
      };
    });

  // Relief milestones — merge loan and chit end events, group by month+year
  type ReliefItem = { name: string; type: "LOAN" | "CHIT"; monthlyRelief: number };
  const eventMap = new Map<string, ReliefItem[]>();
  for (const l of loans) {
    if (!l.isOpenEnded) {
      const key = `${l.endsYear}-${String(l.endsMonth).padStart(2, "0")}`;
      if (!eventMap.has(key)) eventMap.set(key, []);
      eventMap.get(key)!.push({ name: l.name, type: "LOAN", monthlyRelief: l.monthlyAmount });
    }
  }
  // Track when chit obligations end for the relief milestones panel.
  for (const c of chits) {
    if (c.isLifted && c.remainingMonths > 0) {
      const key = `${c.endsYear}-${String(c.endsMonth).padStart(2, "0")}`;
      if (!eventMap.has(key)) eventMap.set(key, []);
      eventMap.get(key)!.push({ name: c.name, type: "CHIT", monthlyRelief: c.monthlyAmount });
    }
  }
  const currentMonthlyCommitted = loans.reduce((s, l) => s + l.monthlyAmount, 0)
    + chits.reduce((s, c) => s + (c.isLifted && c.remainingMonths > 0 ? c.monthlyAmount : 0), 0);
  // Loans with no resolvable end date (explicitly indefinite, or missing
  // the rate/principal/start-date needed to project one) never appear in
  // reliefMilestones below, so they must be excluded from the seed total
  // too — otherwise the running total never reaches zero and "after all
  // clear" silently understates what's actually left.
  const resolvableMonthlyCommitted = loans.reduce((s, l) => s + (l.isOpenEnded ? 0 : l.monthlyAmount), 0)
    + chits.reduce((s, c) => s + (c.isLifted && c.remainingMonths > 0 ? c.monthlyAmount : 0), 0);
  const openEndedMonthlyCommitted = currentMonthlyCommitted - resolvableMonthlyCommitted;
  const sortedReliefEvents = [...eventMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  const reliefMilestones: { month: number; year: number; label: string; monthsFromNow: number; items: ReliefItem[]; totalRelief: number; committedAfter: number }[] = [];
  let runningCommitted = resolvableMonthlyCommitted;
  for (const [key, items] of sortedReliefEvents) {
    const [y, m] = key.split("-").map(Number);
    const monthsFromNow = Math.max(0, (y - todayY2) * 12 + (m - todayM2));
    const totalRelief = items.reduce((s, i) => s + i.monthlyRelief, 0);
    runningCommitted -= totalRelief;
    reliefMilestones.push({ month: m, year: y, label: `${MONTHS[m - 1]} ${y}`, monthsFromNow, items, totalRelief, committedAfter: runningCommitted });
  }

  // CC annual subcats — same repayment exclusion and credit-netting as the
  // monthly ccMap above.
  const ccAnnualSubcatMap = new Map<string, number>();
  for (const m of fyActual) {
    for (const a of m.adHocItems) {
      if (a.type === "EXPENSE" && a.ccTemplateId && !a.isCardRepayment) {
        const subcat = a.subCategory ?? "Other";
        ccAnnualSubcatMap.set(subcat, (ccAnnualSubcatMap.get(subcat) ?? 0) + (a.isCredit ? -a.amount : a.amount));
      }
    }
  }
  const ccAnnualSubcats = [...ccAnnualSubcatMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount }));

  // All-time best/worst months
  const allTimeStats = analyticsMonths.map(m => {
    const isCurrentM = m.month === todayMonth && m.year === todayYear;
    const income = computeMonthIncome(m.adHocItems, incomeTemplates, m.month, m.year, m.salaryIncome);
    const expenses = m.entries
      .reduce((s, e) => s + entryExpense(e, isCurrentM), 0)
      + m.adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0)
      + ccFor(m.month, m.year).total;
    return { label: `${MONTHS[m.month - 1]} ${m.year}`, income, expenses, balance: income - expenses, savingsRate: income > 0 ? Math.round(((income - expenses) / income) * 100) : 0 };
  });
  const bestMonth = allTimeStats.length ? [...allTimeStats].sort((a, b) => b.savingsRate - a.savingsRate)[0] : null;
  const worstMonth = allTimeStats.length ? [...allTimeStats].sort((a, b) => a.savingsRate - b.savingsRate)[0] : null;

  // Prev FY category totals (for YoY)
  const prevFYKey = pastFYSummaries[0]?.fy ?? null;
  const prevFYMonths = prevFYKey ? analyticsMonths.filter(m => {
    const { fyKey: mFY } = getFY(m.month, m.year);
    return mFY === prevFYKey;
  }) : [];
  const prevCatMap = new Map<string, number>();
  for (const m of prevFYMonths) {
    for (const e of m.entries) {
      if (isCC(e)) continue;
      const key = e.template.customCategory ?? e.template.category;
      prevCatMap.set(key, (prevCatMap.get(key) ?? 0) + netAmount(e));
    }
    for (const a of m.adHocItems) {
      if (a.type === "EXPENSE" && !a.ccTemplateId) {
        const key = a.customCategory ?? a.category ?? "MISCELLANEOUS";
        prevCatMap.set(key, (prevCatMap.get(key) ?? 0) + a.amount);
      }
    }
    const ccT = ccFor(m.month, m.year).total;
    if (ccT > 0) prevCatMap.set("CREDIT_CARD", (prevCatMap.get("CREDIT_CARD") ?? 0) + ccT);
  }
  const prevFYSpendByCategory = [...prevCatMap.entries()].map(([key, total]) => ({ key, name: CATEGORY_LABELS[key] ?? key, total }));

  // Income stats
  const avgMonthlyIncome = monthlyTrends.length > 0
    ? Math.round(monthlyTrends.reduce((s, m) => s + m.income, 0) / monthlyTrends.length) : 0;
  const incomeSources = fyActual.reduce((acc, m) => {
    const b = computeMonthIncomeByCategory(m.adHocItems, incomeTemplates, m.month, m.year);
    return { salary: acc.salary + b.salary, freelance: acc.freelance + b.freelance, other: acc.other + b.other, adHoc: acc.adHoc + b.adHoc };
  }, { salary: 0, freelance: 0, other: 0, adHoc: 0 });
  const incomeSourcesTotal = incomeSources.salary + incomeSources.freelance + incomeSources.other + incomeSources.adHoc;
  const freelancePct = incomeSourcesTotal > 0 ? Math.round((incomeSources.freelance / incomeSourcesTotal) * 100) : 0;

  const analyticsData: AnalyticsData = {
    fyExpenses, fyIncome: fyIncomeTotal, fyExpensesProjected, fyIncomeProjected, actualMonthCount: fyActual.length,
    spendByCategory, topMerchants, recurringTotal, adHocExpenseTotal,
    essentialTotal, lifestyleTotal, committedOverhead,
    monthlyTrends, loans, chits, ccAnnualSubcats,
    bestMonth, worstMonth,
    prevFYLabel: prevFYKey, prevFYSpendByCategory,
    avgMonthlyIncome, freelancePct, incomeSources,
    currentMonthlyCommitted, resolvableMonthlyCommitted, openEndedMonthlyCommitted, reliefMilestones,
  };

  // The FY's real starting cash position (April's carried-forward balance)
  // — "projected year-end" below is a true ending-balance figure (starting
  // cash + this FY's full net), not just an isolated income-minus-expenses,
  // so it doesn't silently disagree with the dashboard's own balance.
  const aprilMonth = allMonths.find(m => m.month === 4 && m.year === fyStart);
  const fyOpeningBalance = aprilMonth?.openingBalance ?? 0;
  // Real cash paid this month toward an older bill (see Month.carriedDebtPaid)
  // — only ever non-zero on the current real month, but has to be subtracted
  // here too, same as the dashboard's own balance figures, or a payment like
  // paying off last cycle's carried CC debt would silently vanish from the
  // FY-level ending balance despite genuinely leaving cash on hand.
  const carriedDebtPaidThisFY = currentMonthFull?.carriedDebtPaid ?? 0;

  return (
    <YearOverviewClient
      months={JSON.parse(JSON.stringify(currentFYMonths))}
      fyKey={fyKey}
      fyOpeningBalance={fyOpeningBalance}
      carriedDebtPaid={carriedDebtPaidThisFY}
      pastFYSummaries={pastFYSummaries}
      currentMonthInsights={JSON.parse(JSON.stringify(currentMonthInsights))}
      analyticsData={JSON.parse(JSON.stringify(analyticsData))}
    />
  );
}
