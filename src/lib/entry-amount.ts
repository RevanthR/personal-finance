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

// A lifted chit's monthly contribution can differ from its unlifted one
// (falling back to the template's own amount if never explicitly set) —
// this one-line rule was independently re-typed in both Year View and the
// dashboard's future-month projection (months/page.tsx, dashboard/page.tsx)
// on top of this, the real entry-creation copy, so a future change to it
// only reached one of the three.
export function chitMonthlyAmount(
  chitFund: { isLifted: boolean; monthlyLiftedAmount: number | null; monthlyUnliftedAmount: number },
  fallbackAmount: number,
): number {
  return chitFund.isLifted ? (chitFund.monthlyLiftedAmount ?? fallbackAmount) : chitFund.monthlyUnliftedAmount;
}

export function computeTemplateEntryAmount(
  t: {
    category: string;
    amount: number;
    chitFund?: { isLifted: boolean; monthlyLiftedAmount: number | null; monthlyUnliftedAmount: number } | null;
  },
  baseAmount: number,
  prevCC?: PrevCCState,
): { amount: number; billedAmount?: number; carriedInAmount?: number; openingAmount?: number } {
  if (t.chitFund) {
    return { amount: chitMonthlyAmount(t.chitFund, baseAmount) };
  }
  if (t.category === "CREDIT_CARD") {
    // A negative outstanding here is a carried-forward overpayment credit —
    // floor at 0 rather than let it push the bill negative; any credit
    // beyond what this month's statement absorbs isn't tracked further.
    const amount = Math.max(0, (prevCC?.statement ?? 0) + (prevCC?.outstanding ?? 0));
    // Frozen at creation — only the genuinely unpaid carry from before
    // (`outstanding`), NOT `statement`. `statement` is last cycle's new
    // spend that already closed as ITS OWN bill and is fully reflected in
    // `amount`/`billedAmount` — it isn't unpaid debt, so it shouldn't count
    // as "carried over" until this cycle's own statement closes, same as
    // any other new spend. Only real unpaid debt should show as owed
    // before its own statement day.
    // openingAmount is the same value as amount, but frozen forever — see
    // MonthlyEntry.openingAmount and cc-effects.ts's recomputePreCloseAmount,
    // which uses it (never the live, mutable `amount`) as the fixed starting
    // point to resum from.
    return { amount, billedAmount: amount, carriedInAmount: Math.max(0, prevCC?.outstanding ?? 0), openingAmount: amount };
  }
  return { amount: baseAmount };
}
