// Single source of truth for "what amount does a template's MonthlyEntry
// open at this month" — shared by actual month setup (api/months/route.ts,
// looping every active template) and the immediate-insert path
// (api/templates/route.ts's addToCurrentMonth), which previously always
// used the template's raw `amount` regardless of category, giving new CC
// and chit-fund templates a wrong opening balance when added mid-month.

export type PrevCCState = { statement: number; outstanding: number };

// Distills a previous month's CC entry into the two numbers this month's
// opening balance needs (last statement, and any unpaid/overpaid carry).
export function computePrevCCState(e: {
  statementAmount: number | null;
  isPaid: boolean;
  amount: number;
  billedAmount: number | null;
  paidAmount: number | null;
  cashbackAmount: number | null;
} | null | undefined): PrevCCState {
  if (!e) return { statement: 0, outstanding: 0 };
  const statement = e.statementAmount ?? 0;
  const netObligation = (e.billedAmount ?? e.amount) - (e.cashbackAmount ?? 0);
  if (e.isPaid) {
    // A paid CC entry is normally done and forgotten, but an overpayment
    // (paidAmount > what was owed) is real money that shouldn't just vanish
    // once isPaid flips true — carry the excess forward as a credit.
    const paid = e.paidAmount ?? netObligation;
    const credit = paid - netObligation;
    return { statement, outstanding: credit > 0.5 ? -credit : 0 };
  }
  const outstanding = netObligation - (e.paidAmount ?? 0);
  return { statement, outstanding: outstanding > 0 ? outstanding : 0 };
}

export function computeTemplateEntryAmount(
  t: {
    category: string;
    amount: number;
    chitFund?: { isLifted: boolean; monthlyLiftedAmount: number | null; monthlyUnliftedAmount: number } | null;
  },
  baseAmount: number,
  prevCC?: PrevCCState,
): { amount: number; billedAmount?: number } {
  if (t.chitFund) {
    const amount = t.chitFund.isLifted
      ? (t.chitFund.monthlyLiftedAmount ?? baseAmount)
      : t.chitFund.monthlyUnliftedAmount;
    return { amount };
  }
  if (t.category === "CREDIT_CARD") {
    // A negative outstanding here is a carried-forward overpayment credit —
    // floor at 0 rather than let it push the bill negative; any credit
    // beyond what this month's statement absorbs isn't tracked further.
    const amount = Math.max(0, (prevCC?.statement ?? 0) + (prevCC?.outstanding ?? 0));
    return { amount, billedAmount: amount };
  }
  return { amount: baseAmount };
}
