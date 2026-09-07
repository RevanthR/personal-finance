import { isTemplateActiveInMonth } from "@/lib/loan-utils";
import { chitMonthlyAmount } from "@/lib/entry-amount";
import { pendingAmountKicks, prevMonthYear } from "@/lib/utils";
import type { MonthlyCardBills } from "@/lib/cards-db";

// One projection formula for a month that has no ledger yet (a future month,
// or a not-yet-populated one). The dashboard's future-month view and the
// Year View's projected rows both call this, so a projected month reads the
// same on every screen. Pure — callers do the DB reads and pass data in.

type ChitInfo = {
  isLifted: boolean;
  monthlyLiftedAmount: number | null;
  monthlyUnliftedAmount: number;
  startDate: Date | string;
  durationMonths: number;
} | null;

export type ProjectionTemplate = {
  id: string;
  name: string;
  templateType: string | null;
  category: string;
  customCategory: string | null;
  amount: number;
  isFixed: boolean;
  frequency: string;
  dueMonth: number | null;
  dueDateDay: number | null;
  pendingAmount: number | null;
  pendingFromMonth: number | null;
  pendingFromYear: number | null;
  endsOnMonth: number | null;
  endsOnYear: number | null;
  loanInterestRate: number | null;
  loanOriginalPrincipal: number | null;
  loanStartDate: Date | string | null;
  loanOutstandingOverride: number | null;
  chitFund?: ChitInfo;
};

export type ProjectedIncomeSource = { name: string; amount: number; kind: "template" | "receivable" | "adhoc" };

export type ProjectedExpense = {
  templateId: string | null;
  name: string;
  amount: number;
  category: string;
  customCategory: string | null;
  isFixed: boolean;
  dueDateDay: number | null;
};

export type MonthProjection = {
  income: number;
  incomeSources: ProjectedIncomeSource[];
  expenses: number;
  expenseItems: ProjectedExpense[];
  ccTotal: number;
  ccByCard: MonthlyCardBills["byCard"];
  endingTemplateNames: string[];
};

export function projectMonth(opts: {
  month: number;
  year: number;
  /** Active templates (income and expense), each with its chitFund if any. */
  templates: ProjectionTemplate[];
  /** Card bills for this month, from getCardBillsByMonth. */
  ccBills: MonthlyCardBills;
  receivables?: { description: string; expectedAmount: number; expectedDate: Date | string | null }[];
  /** Ad-hoc rows already sitting on a not-yet-populated month record. */
  existingAdHoc?: { name: string; amount: number; type: string }[];
  /** Last populated month's salaryIncome, used only when there are no income templates. */
  fallbackIncome?: number;
}): MonthProjection {
  const { month, year, templates, ccBills } = opts;
  const receivables = opts.receivables ?? [];
  const existingAdHoc = opts.existingAdHoc ?? [];

  const incomeTemplates = templates.filter(t => t.templateType === "INCOME");
  const expenseTemplates = templates.filter(t => t.templateType !== "INCOME");

  // ── Income ──────────────────────────────────────────────────────────────
  const incomeSources: ProjectedIncomeSource[] = [];
  if (incomeTemplates.length === 0) {
    if (opts.fallbackIncome) incomeSources.push({ name: "Salary", amount: opts.fallbackIncome, kind: "template" });
  } else {
    for (const t of incomeTemplates) {
      const amount = pendingAmountKicks(t, month, year) ? t.pendingAmount! : t.amount;
      if (amount) incomeSources.push({ name: t.name, amount, kind: "template" });
    }
  }
  for (const r of receivables) {
    if (!r.expectedDate) continue;
    const d = new Date(r.expectedDate);
    if (d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month) {
      incomeSources.push({ name: r.description, amount: r.expectedAmount, kind: "receivable" });
    }
  }
  for (const i of existingAdHoc) {
    if (i.type === "INCOME") incomeSources.push({ name: i.name, amount: i.amount, kind: "adhoc" });
  }
  const income = incomeSources.reduce((s, i) => s + i.amount, 0);

  // ── Expenses ────────────────────────────────────────────────────────────
  // Non-CC recurring templates active this month, at their scheduled amount
  // (a pending amount change that has reached its effective month applies to
  // the projection too, same as it would on real month setup).
  const expenseItems: ProjectedExpense[] = expenseTemplates
    .filter(t =>
      t.category !== "CREDIT_CARD" &&
      (t.frequency === "MONTHLY" || (t.frequency === "YEARLY" && t.dueMonth === month)) &&
      isTemplateActiveInMonth(t, month, year)
    )
    .map(t => ({
      templateId: t.id,
      name: t.name,
      amount: t.chitFund
        ? chitMonthlyAmount(t.chitFund, t.amount)
        : (pendingAmountKicks(t, month, year) ? t.pendingAmount! : t.amount),
      category: t.category,
      customCategory: t.customCategory,
      isFixed: t.isFixed,
      dueDateDay: t.dueDateDay,
    }));

  // Credit cards from the shared per-month bill formula (cardBillForMonth).
  for (const line of ccBills.byCard) {
    expenseItems.push({
      templateId: line.templateId, name: line.name, amount: line.amount,
      category: "CREDIT_CARD", customCategory: null, isFixed: false, dueDateDay: null,
    });
  }
  const expenses = expenseItems.reduce((s, e) => s + e.amount, 0);

  // ── Templates that stop generating a bill this month ─────────────────────
  const { month: prevM, year: prevY } = prevMonthYear(month, year);
  const endingTemplateNames = expenseTemplates
    .filter(t => t.frequency === "MONTHLY")
    .filter(t => isTemplateActiveInMonth(t, prevM, prevY) && !isTemplateActiveInMonth(t, month, year))
    .map(t => t.name);

  return {
    income, incomeSources,
    expenses, expenseItems,
    ccTotal: ccBills.total, ccByCard: ccBills.byCard,
    endingTemplateNames,
  };
}
