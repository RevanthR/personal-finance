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
  statementAmount: number | null;
  billedAmount: number | null;
  carriedInAmount?: number | null;
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

export interface ProgressMetrics {
  totalCommitted: number;
  totalPaid: number;
  totalPending: number;
  paidPercent: number;
  pendingCount: number;
  ccBillsThisMonth: number;
  recurringNonCC: number;
  ccNextMonth: number;
  // Real prior-cycle CC debt still on a not-yet-closed card — in
  // totalPending already, broken out so callers can show it separately
  // from this month's own Expenditure/CC Bill figures.
  carriedCCDebt: number;
  // Cash-flow view, distinct from totalCommitted/totalPaid above: a bill
  // paid via a card contributes fully to totalCommitted/totalPaid (it's
  // settled, nothing left to chase) but NOT to these — no actual cash
  // moves until that card's own bill gets paid off, at which point the
  // card's entry (now carrying that amount) counts here instead. Real
  // balance/cash-in-hand figures should use these, not totalCommitted/totalPaid.
  cashCommitted: number;
  cashPaid: number;
}

/**
 * Entry's net obligation after cashback. Takes just the two fields it
 * needs (not the full EntryBase) so callers with a narrower query shape —
 * gmail matching/dedupe, which don't select statementAmount/billedAmount —
 * can call the real formula instead of re-deriving `amount - cashback` by
 * hand, which is exactly how this and effectivePaid below ended up
 * reimplemented independently in gmail/entry-match.ts and gmail/dedupe.ts.
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
 * closing now. Single source of truth for both directions of this rule:
 * which spend lands in this cycle's `amount` vs next cycle's
 * `statementAmount` (cc-effects.ts).
 */
export function isPreCloseDate(date: Date, statementDay: number | null): boolean {
  return statementDay !== null && date.getDate() < statementDay;
}

/**
 * The real calendar date of the most recent Bill Generation Date that's
 * already happened (today counts) — also, by definition, the day the
 * currently-open cycle started accumulating. Unlike isPreCloseDate (which
 * only compares a day-of-month within one already-known month), this
 * resolves an actual month/year, so it can tell "1st" in the card's own
 * next-cycle label apart from "1st of which month" — and lets a caller
 * with charges spanning more than one calendar month (e.g. a statement
 * popup) split them by real chronological cycle membership instead of by
 * which month each charge happens to be dated in.
 */
export function mostRecentCloseDate(statementDay: number, asOf: Date = new Date()): Date {
  const y = asOf.getFullYear(), m = asOf.getMonth();
  return asOf.getDate() >= statementDay ? new Date(y, m, statementDay) : new Date(y, m - 1, statementDay);
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
export function isDueDateNextMonth(
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
  if (incomeTemplates.length === 0) {
    const nonOverrideAdhoc = adHocItems
      .filter(i => i.type === "INCOME" && !i.notes?.startsWith("income_override:"))
      .reduce((sum, i) => sum + i.amount, 0);
    return salaryIncomeFallback + nonOverrideAdhoc;
  }

  const overrides = new Map<string, number>();
  let nonOverrideAdhoc = 0;
  for (const item of adHocItems) {
    if (item.type !== "INCOME") continue;
    if (item.notes?.startsWith("income_override:")) {
      overrides.set(item.notes.slice("income_override:".length), item.amount);
    } else {
      nonOverrideAdhoc += item.amount;
    }
  }
  const templateIncome = incomeTemplates.reduce((sum, t) => {
    if (overrides.has(t.id)) return sum + overrides.get(t.id)!;
    const amount = pendingAmountKicks(t, month, year) ? t.pendingAmount! : t.amount;
    return sum + amount;
  }, 0);
  return templateIncome + nonOverrideAdhoc;
}

/**
 * What an entry currently contributes toward "this month's own
 * expenditure" — zero for a credit card whose statement hasn't closed yet
 * (its running amount is old carried debt, tracked separately by
 * carriedDebtAmount below, plus new spend that isn't a real bill yet),
 * otherwise its net amount. Single source of truth for this rule — the
 * dashboard's Expenditure tile and the Year View's per-month Expenses
 * figure both go through this instead of each having their own copy of it.
 */
export function effectiveEntryAmount(
  e: EntryBase,
  isCurrentMonth: boolean,
  todayDay: number,
): number {
  if (isBillPending(e, isCurrentMonth, todayDay)) return 0;
  const net = netAmount(e);
  // A card's own amount can include another bill's payment routed through
  // it — that money is already counted once, under the other bill's own
  // category, so it's excluded here to avoid double-counting Expenditure.
  return e.template.category === "CREDIT_CARD"
    ? Math.max(0, net - (e.billPaymentsAttributed ?? 0))
    : net;
}

/**
 * Real cash contribution of this entry this month — a different view of
 * the same entries as effectiveEntryAmount above, for actual cash-in-hand
 * figures (the dashboard's Cash/UPI balance, the Year View's ending
 * balance) rather than committed-spend ones (Expenditure, category
 * breakdown). A bill settled via a card contributes 0 here — no cash
 * moves until that card's own bill gets paid off, at which point the
 * card's own entry (never itself paidViaCard) counts in full below,
 * attributed portion included. See computeMetrics's cashCommitted/cashPaid
 * for the same split applied in aggregate.
 */
export function cashEntryAmount(
  e: EntryBase,
  isCurrentMonth: boolean,
  todayDay: number,
): number {
  if (isBillPending(e, isCurrentMonth, todayDay)) return 0;
  if (e.paidViaCardTemplateId) return 0;
  return netAmount(e);
}

/**
 * Real, already-billed debt still sitting on a not-yet-closed card —
 * genuinely owed, but last cycle's liability, not this month's own
 * spending (see effectiveEntryAmount above, which excludes it).
 */
export function carriedDebtAmount(
  e: EntryBase,
  isCurrentMonth: boolean,
  todayDay: number,
): number {
  if (!isBillPending(e, isCurrentMonth, todayDay)) return 0;
  return Math.max(0, (e.carriedInAmount ?? 0) - (e.cashbackAmount ?? 0));
}

/**
 * Real cash on hand: what carried in, plus what came in, minus what went
 * out, minus whatever was separately paid this month toward an older bill
 * (carriedDebtPaid is tracked apart from openingBalance/expense so a later
 * payment never has to retroactively rewrite either of those — see
 * Month.carriedDebtPaid). Shared by the dashboard's own balance figures and
 * the Year View's FY-level ending balance instead of each re-deriving it.
 */
export function computeCashBalance(params: {
  openingBalance: number;
  income: number;
  expense: number;
  carriedDebtPaid: number;
}): number {
  return params.openingBalance + params.income - params.expense - params.carriedDebtPaid;
}

/**
 * True when a CC entry owes nothing at all this cycle — no carried-forward
 * debt, no net spend — so it can auto-close as paid without the user ever
 * having to tap anything. Shared by entry creation (setup-month.ts,
 * templates/route.ts's addToCurrentMonth) and the mid-month self-heal in
 * cc-effects.ts (a reversed/deleted charge dropping a card back to zero).
 */
export function isZeroCCBalance(
  amount: number,
  carriedInAmount: number | null | undefined,
  cashbackAmount: number | null | undefined = 0,
): boolean {
  return amount - (cashbackAmount ?? 0) <= 0 && (carriedInAmount ?? 0) <= 0;
}

/** All progress and CC metrics in one pass over entries. */
export function computeMetrics(
  entries: EntryBase[],
  isCurrentMonth: boolean,
  todayDay: number,
): ProgressMetrics {
  let totalCommitted = 0;
  let totalPaid = 0;
  let pendingCount = 0;
  let ccBillsThisMonth = 0;
  let ccNextMonth = 0;
  // Real, already-billed debt still sitting on a not-yet-closed card. This
  // is genuinely owed, so it belongs in Pending — but it's last cycle's
  // liability, not this month's own spending, so it must NOT flow into
  // totalCommitted/ccBillsThisMonth (those feed Expenditure and the CC Bill
  // tile, which should only ever reflect this month's own bills).
  let carriedCCDebt = 0;
  // See ProgressMetrics.cashCommitted/cashPaid — real cash-flow view,
  // separate from the committed/paid (bill-settlement) view above.
  let cashCommitted = 0;
  let cashPaid = 0;

  for (const e of entries) {
    const pending = isBillPending(e, isCurrentMonth, todayDay);

    if (pending) {
      const carried = carriedDebtAmount(e, isCurrentMonth, todayDay);
      if (carried > 0) {
        carriedCCDebt += carried;
        pendingCount++;
      }
      continue;
    }

    const rawNet = netAmount(e);
    const rawPaid = effectivePaid(e);
    const attributed = e.billPaymentsAttributed ?? 0;
    const isCC = e.template.category === "CREDIT_CARD";

    // Committed/paid (bill-settlement view): a card's own bill excludes
    // whatever portion of it is really another bill routed through it —
    // that money is already counted once, under that other bill's own
    // category. A partial card payment is treated as settling the card's
    // own genuine spend first, so this view never shows more paid than committed.
    const net  = isCC ? Math.max(0, rawNet - attributed) : rawNet;
    const paid = isCC
      ? (e.isPaid ? net : Math.max(0, rawPaid - attributed))
      : rawPaid;

    totalCommitted += net;
    totalPaid += paid;
    if (!e.isPaid) pendingCount++;

    // Cash view: a bill settled via a card never moves cash this month —
    // that happens later, when the card itself gets paid off (at which
    // point the card's own rawNet/rawPaid — attributed portion included —
    // correctly counts as cash below, since paidViaCardTemplateId is never
    // set on the card's own entry).
    if (!e.paidViaCardTemplateId) {
      cashCommitted += rawNet;
      cashPaid += rawPaid;
    }

    if (isCC) {
      ccBillsThisMonth += net;
      const rolling = !e.isPaid ? Math.max(0, (e.billedAmount ?? e.amount) - e.amount) : 0;
      ccNextMonth += (e.statementAmount ?? 0) + rolling;
    }
  }

  const recurringNonCC = totalCommitted - ccBillsThisMonth;
  const paidPercent = totalCommitted > 0
    ? Math.min(100, Math.round((totalPaid / totalCommitted) * 100))
    : 0;

  return {
    totalCommitted,
    totalPaid,
    // Carried CC debt counts toward what you owe overall, just not toward
    // this month's own committed spend (see carriedCCDebt above).
    totalPending: totalCommitted - totalPaid + carriedCCDebt,
    carriedCCDebt,
    paidPercent,
    pendingCount,
    ccBillsThisMonth,
    recurringNonCC,
    ccNextMonth,
    cashCommitted,
    cashPaid,
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
