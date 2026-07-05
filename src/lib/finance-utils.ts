/**
 * Pure financial formulas shared between server components (page.tsx) and
 * client components (dashboard-client.tsx, PaidSummaryPanel).
 * No React imports — safe to use in any context.
 */

export interface EntryBase {
  amount: number;
  isPaid: boolean;
  paidAmount: number | null;
  cashbackAmount: number | null;
  statementAmount: number | null;
  billedAmount: number | null;
  template: {
    category: string;
    statementDay: number | null;
    chitFund: { isLifted: boolean } | null;
  };
}

export interface ProgressMetrics {
  totalCommitted: number;
  totalPaid: number;
  totalPending: number;
  paidPercent: number;
  pendingCount: number;
  chitInvestment: number;
  ccBillsThisMonth: number;
  recurringNonCC: number;
  ccNextMonth: number;
}

/** Entry's net obligation after cashback. */
export function netAmount(e: EntryBase): number {
  return e.amount - (e.cashbackAmount ?? 0);
}

/**
 * Actual money out for an entry.
 * When isPaid, paidAmount is only trusted if it's >= entry amount (overpayment);
 * a stale partial paidAmount smaller than the full amount is ignored.
 */
export function effectivePaid(e: EntryBase): number {
  if (e.isPaid) {
    const n = netAmount(e);
    const stored = e.paidAmount ?? n;
    return stored >= n ? stored : n;
  }
  return e.paidAmount ?? 0;
}

/** True when the CC statement hasn't closed yet this month — bill not yet a liability. */
export function isBillPending(
  e: EntryBase,
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

/** Unlifted chit fund payment counts as investment, not expense. */
export function isPreLiftChit(e: EntryBase): boolean {
  return e.template.category === "CHIT_FUND" && !e.template.chitFund?.isLifted;
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
  let chitInvestment = 0;
  let ccBillsThisMonth = 0;
  let ccNextMonth = 0;

  for (const e of entries) {
    const pending = isBillPending(e, isCurrentMonth, todayDay);
    const preLift = isPreLiftChit(e);
    const net = netAmount(e);
    const paid = effectivePaid(e);

    if (preLift) {
      chitInvestment += net;
      continue;
    }
    if (pending) continue;

    totalCommitted += net;
    totalPaid += paid;
    if (!e.isPaid) pendingCount++;

    if (e.template.category === "CREDIT_CARD") {
      ccBillsThisMonth += net;
      // Next month liability: post-close charges + rolling underpaid balance
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
    totalPending: totalCommitted - totalPaid,
    paidPercent,
    pendingCount,
    chitInvestment,
    ccBillsThisMonth,
    recurringNonCC,
    ccNextMonth,
  };
}
