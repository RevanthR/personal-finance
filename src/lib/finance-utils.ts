/**
 * Pure financial formulas shared between server components (page.tsx) and
 * client components (dashboard-client.tsx, PaidSummaryPanel).
 * No React imports — safe to use in any context.
 */

import { pendingAmountKicks } from "./utils";

export interface EntryBase {
  amount: number;
  isPaid: boolean;
  paidAmount: number | null;
  cashbackAmount: number | null;
  statementAmount: number | null;
  billedAmount: number | null;
  carriedInAmount?: number | null;
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

    const net = netAmount(e);
    const paid = effectivePaid(e);

    totalCommitted += net;
    totalPaid += paid;
    if (!e.isPaid) pendingCount++;

    if (e.template.category === "CREDIT_CARD") {
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
  };
}
