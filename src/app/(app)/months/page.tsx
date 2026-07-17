import { getSession } from "@/lib/get-session";
import { getActiveTemplates } from "@/lib/cached-queries";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { computeTemplateEndDate } from "@/lib/loan-utils";
import { computeMonthIncome } from "@/lib/finance-utils";
import { YearOverviewClient, type MonthData } from "@/components/months/year-overview-client";
import { CATEGORY_LABELS, CATEGORY_COLORS, MONTHS, pendingAmountKicks } from "@/lib/utils";
import type { AnalyticsData } from "@/components/months/stats-breakdown";

// Must match CC_SUBCATEGORIES in dashboard-client.tsx — used to pick the
// real subcategory out of a CC ad-hoc item's notes field regardless of
// where in the "·"-joined string it lands (manual entries via the ad-hoc
// dialog format it as "CardName · Subcategory · userNotes"; Gmail-approved
// entries format it as "Subcategory · Imported from Gmail" — different
// positions, so a positional a.notes.split("·")[1] picked up the literal
// "Imported from Gmail" marker for the latter instead of the real category).
const CC_SPEND_SUBCATEGORIES = ["Food", "Coffee", "Groceries", "Fuel", "Shopping", "Travel", "Health", "Bills", "Entertainment", "Other"];

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

  const [allMonths, allTemplates, currentMonthFull, pendingReceivables, analyticsMonths] = await Promise.all([
    db.month.findMany({
      where: { userId },
      include: { entries: { include: { template: true } }, adHocItems: true },
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
    db.month.findMany({
      where: { userId, isPopulated: true },
      include: { entries: { include: { template: true } }, adHocItems: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    }),
  ]);

  // CC statement amounts from current month — used to make the next-month projection more accurate
  // (statementAmount reflects actual post-close charges, not the template default)
  const ccStatements = new Map<string, number>();
  const todayDay = now.getDate();
  // CC entries whose statement hasn't closed yet — exclude from current month's expense total
  const pendingCCBillIds = new Set<string>();
  if (currentMonthFull?.isPopulated) {
    for (const e of currentMonthFull.entries) {
      if (e.template.category === "CREDIT_CARD" && e.statementAmount != null && e.statementAmount > 0) {
        ccStatements.set(e.templateId, e.statementAmount);
      }
      if (e.template.category === "CREDIT_CARD" && e.template.statementDay != null && todayDay < e.template.statementDay) {
        pendingCCBillIds.add(e.id);
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

  // Pre-compute end dates for loans and chit funds from their start dates / amortization
  const templateEndDates = new Map<string, { month: number; year: number }>();
  for (const t of expenseTemplates) {
    const end = computeTemplateEndDate(t);
    if (end) templateEndDates.set(t.id, end);
  }

  // Returns false if a template has ended before the given projected month
  function isTemplateActiveInMonth(
    t: (typeof allTemplates)[number],
    projMonth: number,
    projYear: number,
  ): boolean {
    // Manual end date (non-loan, non-chit)
    if (t.endsOnYear != null && t.endsOnMonth != null && t.category !== "LOAN" && t.category !== "CHIT_FUND") {
      if (projYear > t.endsOnYear) return false;
      if (projYear === t.endsOnYear && projMonth > t.endsOnMonth) return false;
    }
    // Computed end date for loans and chit funds
    const computed = templateEndDates.get(t.id);
    if (computed) {
      if (projYear > computed.year) return false;
      if (projYear === computed.year && projMonth > computed.month) return false;
    }
    // Chit fund: don't include months before the chit's start date
    if (t.category === "CHIT_FUND" && t.chitFund?.startDate) {
      const chitStart = new Date(String(t.chitFund.startDate));
      const chitStartY = chitStart.getUTCFullYear();
      const chitStartM = chitStart.getUTCMonth() + 1;
      if (projYear < chitStartY || (projYear === chitStartY && projMonth < chitStartM)) return false;
    }
    return true;
  }

  // Current FY months (actual or projected)
  const currentFYMonths: MonthData[] = fyMonths.map(({ month, year }) => {
    const actual = allMonths.find(m => m.month === month && m.year === year && m.isPopulated);
    if (actual) {
      const income = computeMonthIncome(actual.adHocItems, incomeTemplates, month, year);
      const isActualCurrentMonth = month === todayMonth && year === todayYear;
      const billableEntries = actual.entries.filter(e => !isActualCurrentMonth || !pendingCCBillIds.has(e.id));
      const expenses = billableEntries.reduce((s, e) => s + e.amount - (e.cashbackAmount ?? 0), 0)
        + actual.adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0);
      const ccEntries = billableEntries.filter(e => e.template.category === "CREDIT_CARD");
      const ccTotal = ccEntries.reduce((s, e) => s + e.amount - (e.cashbackAmount ?? 0), 0);
      const ccByCardMap = new Map<string, { name: string; amount: number }>();
      for (const e of ccEntries) {
        const amt = e.amount - (e.cashbackAmount ?? 0);
        const existing = ccByCardMap.get(e.templateId);
        if (existing) existing.amount += amt;
        else ccByCardMap.set(e.templateId, { name: e.template.name, amount: amt });
      }
      const ccByCard = [...ccByCardMap.entries()].map(([templateId, v]) => ({ templateId, ...v }));
      return {
        id: actual.id, month, year, income, expenses, ccTotal, ccByCard,
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
    let projCCTotal = 0;
    const projCCByCard: { templateId: string; name: string; amount: number }[] = [];
    const projExpenses = activeThisMonth.reduce((s, t) => {
      let amount = t.amount;
      if (t.chitFund) {
        amount = t.chitFund.isLifted
          ? (t.chitFund.monthlyLiftedAmount ?? t.amount)
          : t.chitFund.monthlyUnliftedAmount;
      } else if (t.category === "CREDIT_CARD" && isImmediateNext && ccStatements.has(t.id)) {
        amount = ccStatements.get(t.id)!;
      }
      if (t.category === "CREDIT_CARD") {
        projCCTotal += amount;
        projCCByCard.push({ templateId: t.id, name: t.name, amount });
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
      income: projIncome, expenses: projExpenses, ccTotal: projCCTotal, ccByCard: projCCByCard,
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
    const income = computeMonthIncome(m.adHocItems, incomeTemplates, m.month, m.year);
    const expenses = m.entries.reduce((s, e) => s + e.amount - (e.cashbackAmount ?? 0), 0)
      + m.adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0);
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
    const cmIncome = computeMonthIncome(cm.adHocItems, incomeTemplates, cm.month, cm.year);
    const cmExpenses = cm.entries
      .filter(e => !pendingCCBillIds.has(e.id))
      .reduce((s, e) => s + e.amount - (e.cashbackAmount ?? 0), 0)
      + cm.adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0);

    // Category breakdown — entries grouped by template.category (exclude pending CC bills)
    const catMap = new Map<string, number>();
    for (const e of cm.entries) {
      if (pendingCCBillIds.has(e.id)) continue;
      const cat = e.template.customCategory ?? e.template.category;
      catMap.set(cat, (catMap.get(cat) ?? 0) + e.amount - (e.cashbackAmount ?? 0));
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

    // CC sub-category breakdown from adHocItems notes
    const ccMap = new Map<string, number>();
    for (const a of cm.adHocItems) {
      if (a.type === "EXPENSE" && a.ccTemplateId) {
        const subcat = a.customCategory ?? (a.notes
          ? a.notes.split("·").map(p => p.trim()).find(p => CC_SPEND_SUBCATEGORIES.includes(p)) ?? "Other"
          : "Other");
        ccMap.set(subcat, (ccMap.get(subcat) ?? 0) + a.amount);
      }
    }
    const ccSubcatBreakdown = [...ccMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount }));

    // Upcoming unpaid entries with due dates (exclude pending CC bills)
    const upcomingPayments = cm.entries
      .filter(e => !e.isPaid && e.template.dueDateDay != null && !pendingCCBillIds.has(e.id))
      .map(e => ({
        name: e.template.name,
        amount: e.amount - (e.cashbackAmount ?? 0) - (e.paidAmount ?? 0),
        dueDay: e.template.dueDateDay!,
        overdue: e.template.dueDateDay! < todayDay,
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
      if (isCurrentM && pendingCCBillIds.has(e.id)) continue;
      const t = e.template;
      const ex = templateMap.get(e.templateId);
      const netAmt = e.amount - (e.cashbackAmount ?? 0);
      if (ex) { ex.total += netAmt; ex.months++; }
      else templateMap.set(e.templateId, { name: t.name, category: t.category, customCategory: t.customCategory ?? null, total: netAmt, months: 1 });
      recurringTotal += netAmt;
    }
    for (const a of m.adHocItems) {
      if (a.type === "EXPENSE" && !a.ccTemplateId) adHocExpenseTotal += a.amount;
    }
  }
  const fyExpenses = recurringTotal + adHocExpenseTotal;
  const fyIncomeTotal = fyActual.reduce((s, m) => s + computeMonthIncome(m.adHocItems, incomeTemplates, m.month, m.year), 0);
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
    const income = computeMonthIncome(m.adHocItems, incomeTemplates, m.month, m.year);
    const expenses = m.entries
      .filter(e => !isCurrentM || !pendingCCBillIds.has(e.id))
      .reduce((s, e) => s + e.amount - (e.cashbackAmount ?? 0), 0)
      + m.adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0);
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
  const loans = allTemplates
    .filter(t => t.category === "LOAN" && t.templateType !== "INCOME" && t.isActive && !t.foreClosedOn)
    .map(t => {
      let remainingMonths: number | null = null, totalRemaining: number | null = null;
      if (t.endsOnMonth && t.endsOnYear) {
        remainingMonths = Math.max(0, (t.endsOnYear - todayY2) * 12 + (t.endsOnMonth - todayM2));
        totalRemaining = remainingMonths * t.amount;
      }
      // Compute amortization if loan details are present
      let amortization: { outstandingPrincipal: number; interestThisMonth: number; principalThisMonth: number; totalInterestRemaining: number; monthsRemaining: number; isOverride: boolean } | null = null;
      if (t.loanInterestRate != null) {
        const r = t.loanInterestRate / 12 / 100;
        let outstanding = t.loanOutstandingOverride ?? 0;
        const isOverride = t.loanOutstandingOverride != null && t.loanOutstandingOverride > 0;
        if (!isOverride && t.loanOriginalPrincipal && t.loanStartDate) {
          const start = new Date(t.loanStartDate);
          const k = Math.max(0, (now2.getFullYear() - start.getFullYear()) * 12 + (now2.getMonth() - start.getMonth()));
          const factor = Math.pow(1 + r, k);
          outstanding = Math.max(0, t.loanOriginalPrincipal * factor - (t.amount * (factor - 1)) / r);
        }
        if (outstanding > 0 && r > 0) {
          const interestThisMonth = outstanding * r;
          const principalThisMonth = Math.max(0, t.amount - interestThisMonth);
          const monthsRem = interestThisMonth < t.amount ? Math.ceil(Math.log(t.amount / (t.amount - outstanding * r)) / Math.log(1 + r)) : 0;
          amortization = {
            outstandingPrincipal: Math.round(outstanding),
            interestThisMonth: Math.round(interestThisMonth),
            principalThisMonth: Math.round(principalThisMonth),
            totalInterestRemaining: Math.max(0, Math.round(monthsRem * t.amount - outstanding)),
            monthsRemaining: monthsRem,
            isOverride,
          };
        }
      }
      // If amortization is available, derive end date from monthsRemaining (more accurate)
      let finalEndsMonth = t.endsOnMonth ?? null;
      let finalEndsYear = t.endsOnYear ?? null;
      if (amortization && amortization.monthsRemaining > 0) {
        const projEnd = new Date(now2.getFullYear(), now2.getMonth() + amortization.monthsRemaining, 1);
        finalEndsMonth = projEnd.getMonth() + 1;
        finalEndsYear = projEnd.getFullYear();
        remainingMonths = amortization.monthsRemaining;
        totalRemaining = amortization.monthsRemaining * t.amount;
      }
      return {
        name: t.name, monthlyAmount: t.amount,
        endsMonth: finalEndsMonth, endsYear: finalEndsYear,
        remainingMonths, totalRemaining,
        interestRate: t.loanInterestRate ?? null,
        rateType: t.loanRateType ?? null,
        amortization,
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
      const monthlyAmount = cf.isLifted ? (cf.monthlyLiftedAmount ?? t.amount) : cf.monthlyUnliftedAmount;
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
    if (l.endsYear && l.endsMonth) {
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
  const sortedReliefEvents = [...eventMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  const reliefMilestones: { month: number; year: number; label: string; monthsFromNow: number; items: ReliefItem[]; totalRelief: number; committedAfter: number }[] = [];
  let runningCommitted = currentMonthlyCommitted;
  for (const [key, items] of sortedReliefEvents) {
    const [y, m] = key.split("-").map(Number);
    const monthsFromNow = Math.max(0, (y - todayY2) * 12 + (m - todayM2));
    const totalRelief = items.reduce((s, i) => s + i.monthlyRelief, 0);
    runningCommitted -= totalRelief;
    reliefMilestones.push({ month: m, year: y, label: `${MONTHS[m - 1]} ${y}`, monthsFromNow, items, totalRelief, committedAfter: runningCommitted });
  }

  // CC annual subcats
  const ccAnnualSubcatMap = new Map<string, number>();
  for (const m of fyActual) {
    for (const a of m.adHocItems) {
      if (a.type === "EXPENSE" && a.ccTemplateId) {
        const parts = a.notes ? a.notes.split("·") : [];
        const subcat = a.customCategory ?? (parts.length > 1 ? parts[1].trim() : "Other");
        ccAnnualSubcatMap.set(subcat, (ccAnnualSubcatMap.get(subcat) ?? 0) + a.amount);
      }
    }
  }
  const ccAnnualSubcats = [...ccAnnualSubcatMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount }));

  // All-time best/worst months
  const allTimeStats = analyticsMonths.map(m => {
    const isCurrentM = m.month === todayMonth && m.year === todayYear;
    const income = computeMonthIncome(m.adHocItems, incomeTemplates, m.month, m.year);
    const expenses = m.entries
      .filter(e => !isCurrentM || !pendingCCBillIds.has(e.id))
      .reduce((s, e) => s + e.amount - (e.cashbackAmount ?? 0), 0)
      + m.adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0);
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
      const key = e.template.customCategory ?? e.template.category;
      prevCatMap.set(key, (prevCatMap.get(key) ?? 0) + e.amount - (e.cashbackAmount ?? 0));
    }
    for (const a of m.adHocItems) {
      if (a.type === "EXPENSE" && !a.ccTemplateId) {
        const key = a.customCategory ?? a.category ?? "MISCELLANEOUS";
        prevCatMap.set(key, (prevCatMap.get(key) ?? 0) + a.amount);
      }
    }
  }
  const prevFYSpendByCategory = [...prevCatMap.entries()].map(([key, total]) => ({ key, name: CATEGORY_LABELS[key] ?? key, total }));

  // Income stats
  const avgMonthlyIncome = monthlyTrends.length > 0
    ? Math.round(monthlyTrends.reduce((s, m) => s + m.income, 0) / monthlyTrends.length) : 0;
  const freelancePct = 0;
  const incomeSources = {
    salary: fyIncomeTotal,
    freelance: 0,
    other: 0,
    adHoc: 0,
  };

  const analyticsData: AnalyticsData = {
    fyExpenses, fyIncome: fyIncomeTotal, fyExpensesProjected, fyIncomeProjected, actualMonthCount: fyActual.length,
    spendByCategory, recurringTotal, adHocExpenseTotal,
    essentialTotal, lifestyleTotal, committedOverhead,
    monthlyTrends, loans, chits, ccAnnualSubcats,
    bestMonth, worstMonth,
    prevFYLabel: prevFYKey, prevFYSpendByCategory,
    avgMonthlyIncome, freelancePct, incomeSources,
    currentMonthlyCommitted, reliefMilestones,
  };

  return (
    <YearOverviewClient
      months={JSON.parse(JSON.stringify(currentFYMonths))}
      fyKey={fyKey}
      pastFYSummaries={pastFYSummaries}
      incomeTemplateCount={incomeTemplates.length}
      currentMonthInsights={JSON.parse(JSON.stringify(currentMonthInsights))}
      analyticsData={JSON.parse(JSON.stringify(analyticsData))}
    />
  );
}
