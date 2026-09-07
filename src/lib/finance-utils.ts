/**
 * Pure financial formulas shared between server components (page.tsx) and
 * client components (dashboard-client.tsx, PaidSummaryPanel).
 * No React imports — safe to use in any context.
 */

import { pendingAmountKicks, nextMonthYear } from "./utils";

export interface EntryBase {
  amount: number;
  isPaid: boolean;
  paidAmount: number | null;
  cashbackAmount: number | null;
  // CC only: how much of this card's own amount is really another bill
  // routed through it (see paidViaCardTemplateId below) — excluded from
  // committed/paid totals (already counted once, under that other bill's
  // own category) but not from cash totals (paying off THIS card still
  // takes that much real cash).
  billPaymentsAttributed?: number | null;
  // Non-CC only: set when this bill was settled via a credit card instead
  // of cash/bank — excludes it from cash totals (the cash effect is
  // deferred to whenever that card's own bill gets paid off) without
  // touching its committed/paid status (the bill itself is still settled).
  paidViaCardTemplateId?: string | null;
  template: {
    category: string;
    statementDay: number | null;
  };
}

// Credit cards no longer flow through computeMetrics at all — every caller
// pre-filters them out and reads card figures from cardStatus() /
// getCardBillsByMonth instead. These are the recurring non-CC bill totals only.
export interface ProgressMetrics {
  totalCommitted: number;
  totalPaid: number;
  totalPending: number;
  paidPercent: number;
  pendingCount: number;
}

/**
 * Entry's net obligation after cashback. Takes just the two fields it
 * needs (not the full EntryBase) so callers with a narrower query shape —
 * gmail matching/dedupe — can call the real formula instead of re-deriving
 * `amount - cashback` by hand, which is exactly how this and effectivePaid
 * below ended up reimplemented independently in gmail/entry-match.ts and
 * gmail/dedupe.ts.
 */
export function netAmount(e: { amount: number; cashbackAmount: number | null }): number {
  return e.amount - (e.cashbackAmount ?? 0);
}

/**
 * Actual money out for an entry.
 * When isPaid, paidAmount is only trusted if it's >= entry amount (overpayment);
 * a stale partial paidAmount smaller than the full amount is ignored.
 */
export function effectivePaid(e: { amount: number; cashbackAmount: number | null; isPaid: boolean; paidAmount: number | null }): number {
  if (e.isPaid) {
    const n = netAmount(e);
    const stored = e.paidAmount ?? n;
    return stored >= n ? stored : n;
  }
  return e.paidAmount ?? 0;
}

/**
 * True when the CC statement hasn't closed yet this month — bill not yet a
 * liability. Only needs the template's category/statementDay, not a full
 * EntryBase, so gmail matching (which queries a narrower shape) can call
 * this instead of re-deriving the same day/statementDay boundary itself.
 */
export function isBillPending(
  e: { template: { category: string; statementDay: number | null } },
  isCurrentMonth: boolean,
  todayDay: number,
): boolean {
  return (
    isCurrentMonth &&
    e.template.category === "CREDIT_CARD" &&
    e.template.statementDay != null &&
    todayDay < e.template.statementDay
  );
}

/**
 * True when a charge dated `date` belongs to the cycle that's still open
 * (or just closed) rather than the one after it. The statement GENERATES
 * on statementDay, so a charge dated exactly on that day has already
 * missed the cut — it belongs to the next cycle, not this one. Only a
 * charge dated strictly before statementDay counts as part of the bill
 * closing now. Single source of truth for the day-of-month side of this
 * rule (src/lib/cards.ts does the full month-aware cycle math).
 */
export function isPreCloseDate(date: Date, statementDay: number | null): boolean {
  return statementDay !== null && date.getDate() < statementDay;
}

/**
 * True when a Payment Due Date structurally falls in the month AFTER the
 * Bill Generation Date's own month — a card that generates the 15th and
 * is due the 5th is due NEXT month's 5th, not this month's (which would
 * already be long past by the time the bill even closes). The one rule
 * both functions below build on, and the only thing the dashboard's own
 * card display needs (it already knows which month it's showing) — the
 * fuller actualDueDate/isPastDueDate below exist for callers that only
 * have a bare day number and need the real month/year worked out too.
 */
function isDueDateNextMonth(
  billGenerationDay: number | null,
  paymentDueDay: number | null,
): boolean {
  return billGenerationDay != null && paymentDueDay != null && paymentDueDay < billGenerationDay;
}

/**
 * The real calendar month/year a bill's Payment Due Date falls in, given
 * the month its own entry belongs to. Single source of truth for this —
 * previously the overdue flag (months/page.tsx, dashboard-client.tsx) and
 * the reminder cron compared the raw day number against today with no
 * month awareness at all, so a wrapping due date (Bill Generation Date >
 * Payment Due Date, e.g. generates 15th/due 5th) read as overdue for most
 * of the month and could reminder-notify for the wrong month's bill entirely.
 */
export function actualDueDate(
  entryMonth: number,
  entryYear: number,
  billGenerationDay: number | null,
  paymentDueDay: number,
): { month: number; year: number; day: number } {
  const { month, year } = isDueDateNextMonth(billGenerationDay, paymentDueDay)
    ? nextMonthYear(entryMonth, entryYear)
    : { month: entryMonth, year: entryYear };
  return { month, year, day: paymentDueDay };
}

/** True when today is strictly after this bill's real (month-aware) Payment Due Date. */
export function isPastDueDate(
  entryMonth: number,
  entryYear: number,
  billGenerationDay: number | null,
  paymentDueDay: number,
  todayMonth: number,
  todayYear: number,
  todayDay: number,
): boolean {
  const due = actualDueDate(entryMonth, entryYear, billGenerationDay, paymentDueDay);
  if (todayYear !== due.year) return todayYear > due.year;
  if (todayMonth !== due.month) return todayMonth > due.month;
  return todayDay > due.day;
}

export interface IncomeTemplateForCalc {
  id: string;
  amount: number;
  pendingAmount: number | null;
  pendingFromMonth: number | null;
  pendingFromYear: number | null;
}

export interface AdHocForIncome {
  type: string;
  amount: number;
  notes: string | null;
}

const OVERRIDE_PREFIX = "income_override:";

/**
 * The `income_override:<templateId>` ad-hoc rows for a month, as
 * templateId → amount. Such a row REPLACES that template's amount for the
 * month rather than adding on top. Shared by every income calculation
 * (the month total, the per-category split, the dated cash events).
 */
export function incomeOverrides(adHocItems: AdHocForIncome[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of adHocItems) {
    if (i.type === "INCOME" && i.notes?.startsWith(OVERRIDE_PREFIX)) {
      m.set(i.notes.slice(OVERRIDE_PREFIX.length), i.amount);
    }
  }
  return m;
}

/** One income template's amount for a month: an override wins, else the
 * scheduled amount (a reached pending change promoted). */
export function resolvedTemplateIncome(
  t: IncomeTemplateForCalc,
  overrides: Map<string, number>,
  month: number,
  year: number,
): number {
  if (overrides.has(t.id)) return overrides.get(t.id)!;
  return pendingAmountKicks(t, month, year) ? t.pendingAmount! : t.amount;
}

/** Non-override ad-hoc INCOME for a month (added on top of template income). */
export function adHocIncomeTotal(adHocItems: AdHocForIncome[]): number {
  return adHocItems
    .filter(i => i.type === "INCOME" && !i.notes?.startsWith(OVERRIDE_PREFIX))
    .reduce((sum, i) => sum + i.amount, 0);
}

/**
 * Correct income for a month.
 * income_override:<templateId> adhocs REPLACE the corresponding template's amount.
 * Regular adhoc INCOME items are added on top.
 * Uses current template amounts for non-overridden templates (with pendingAmount promotion).
 */
export function computeMonthIncome(
  adHocItems: AdHocForIncome[],
  incomeTemplates: IncomeTemplateForCalc[],
  month: number,
  year: number,
  // Manually-entered Month.salaryIncome, used only when there's no income
  // template to derive a live figure from — otherwise that manual number
  // was silently discarded and a template-less month's income read as 0.
  salaryIncomeFallback = 0,
): number {
  const nonOverrideAdhoc = adHocIncomeTotal(adHocItems);
  if (incomeTemplates.length === 0) return salaryIncomeFallback + nonOverrideAdhoc;

  const overrides = incomeOverrides(adHocItems);
  const templateIncome = incomeTemplates.reduce(
    (sum, t) => sum + resolvedTemplateIncome(t, overrides, month, year), 0,
  );
  return templateIncome + nonOverrideAdhoc;
}

/**
 * What an entry contributes toward "this month's own expenditure" — its net
 * amount after cashback. Zero for a credit card whose statement hasn't
 * closed yet (its running amount isn't a real bill), and a card's own
 * amount drops whatever portion is really another bill routed through it.
 * Single source of truth for this rule — the dashboard's Expenditure tile
 * and the Year View's per-month Expenses both go through it.
 */
export function effectiveEntryAmount(
  e: EntryBase,
  isCurrentMonth: boolean,
  todayDay: number,
): number {
  if (isBillPending(e, isCurrentMonth, todayDay)) return 0;
  const net = netAmount(e);
  return e.template.category === "CREDIT_CARD"
    ? Math.max(0, net - (e.billPaymentsAttributed ?? 0))
    : net;
}

/**
 * Committed / paid / pending totals for a month's recurring bills.
 * Credit cards never reach here — every caller filters them out and reads
 * card figures from cardStatus() / getCardBillsByMonth instead.
 */
export function computeMetrics(entries: EntryBase[]): ProgressMetrics {
  let totalCommitted = 0;
  let totalPaid = 0;
  let pendingCount = 0;

  for (const e of entries) {
    totalCommitted += netAmount(e);
    totalPaid += effectivePaid(e);
    if (!e.isPaid) pendingCount++;
  }

  const paidPercent = totalCommitted > 0
    ? Math.min(100, Math.round((totalPaid / totalCommitted) * 100))
    : 0;

  return {
    totalCommitted,
    totalPaid,
    totalPending: totalCommitted - totalPaid,
    paidPercent,
    pendingCount,
  };
}

// ── Projected (future-month) expense grouping ────────────────────────────────

export type ProjectedExpenseInput = {
  amount: number;
  category: string;
  customCategory: string | null;
  isFixed: boolean;
};

export type ProjectedExpenseGroups<T> = {
  // Non-CC entries grouped by custom category (if set) else base category,
  // categories sorted by total desc, items within each sorted by amount desc.
  categories: { key: string; items: T[]; total: number }[];
  cc: T[];
  ccTotal: number;
  // fixed/variable span every entry (CC included), matching the dashboard's
  // own Fixed/Variable tiles: variable is just total minus fixed.
  fixed: number;
  variable: number;
  total: number;
};

// Regroups the flat projected-entry list the dashboard already computes for a
// future month into the shape its Payables / Pending drilldowns render. Pure
// so it can be unit-tested and reused server-side; the presentational label
// and color per category are added by the caller.
export function groupProjectedExpenses<T extends ProjectedExpenseInput>(entries: T[]): ProjectedExpenseGroups<T> {
  const byCat = new Map<string, { key: string; items: T[]; total: number }>();
  const cc: T[] = [];
  let ccTotal = 0;
  let fixed = 0;
  let total = 0;

  for (const e of entries) {
    total += e.amount;
    if (e.isFixed) fixed += e.amount;
    if (e.category === "CREDIT_CARD") {
      cc.push(e);
      ccTotal += e.amount;
      continue;
    }
    const key = e.customCategory ?? e.category;
    const g = byCat.get(key) ?? { key, items: [], total: 0 };
    g.items.push(e);
    g.total += e.amount;
    byCat.set(key, g);
  }

  const categories = [...byCat.values()]
    .map(g => ({ ...g, items: [...g.items].sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.total - a.total);
  cc.sort((a, b) => b.amount - a.amount);

  return { categories, cc, ccTotal, fixed, variable: total - fixed, total };
}

