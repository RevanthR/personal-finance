// Single source of truth for "what amount does a template's MonthlyEntry
// open at this month" — shared by actual month setup (api/months/route.ts,
// looping every active template) and the immediate-insert path
// (api/templates/route.ts's addToCurrentMonth), which previously always
// used the template's raw `amount` regardless of category, giving new CC
// and chit-fund templates a wrong opening balance when added mid-month.

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
): { amount: number } {
  if (t.chitFund) {
    return { amount: chitMonthlyAmount(t.chitFund, baseAmount) };
  }
  // Credit cards no longer create MonthlyEntry rows — they run entirely off
  // CardStatement + logged AdHocItem charges (see src/lib/cards.ts,
  // cardStatus()). Callers skip CREDIT_CARD templates before reaching here.
  return { amount: baseAmount };
}
