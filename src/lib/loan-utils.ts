export function computeLoanEndDate(params: {
  emi: number;
  annualRate: number;
  originalPrincipal?: number | null;
  startDate?: Date | string | null;
  outstandingOverride?: number | null;
  // Baseline to project monthsRemaining forward from. Defaults to today.
  // Pass the loan's own start date to get a full-tenure (k=0) projection
  // for a loan that hasn't started yet, instead of one anchored to today
  // that understates the term by however far away the start date is.
  asOf?: Date;
}): { month: number; year: number } | null {
  const asOf = params.asOf ?? new Date();
  const amort = computeLoanAmortization({ ...params, today: asOf });
  if (!amort || amort.monthsRemaining <= 0) return null;
  const d = new Date(asOf);
  d.setMonth(d.getMonth() + amort.monthsRemaining);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

export function computeChitEndDate(startDateStr: string, durationMonths: number): { month: number; year: number } {
  const start = new Date(startDateStr);
  const startM = start.getUTCMonth(); // 0-indexed
  const startY = start.getUTCFullYear();
  const totalMonths = startM + durationMonths - 1;
  return { month: (totalMonths % 12) + 1, year: startY + Math.floor(totalMonths / 12) };
}

// Single source of truth for "when does this loan/chit template stop
// generating entries" — a computed end date from amortization/chit-duration
// math, distinct from (and, for these two categories, authoritative over)
// the template's manual endsOnMonth/endsOnYear fields. Used by both the
// Year View's projection and actual month setup so a loan considered "paid
// off" by the math can't keep generating real bills in one path while the
// other correctly stops projecting it.
export function computeTemplateEndDate(t: {
  category: string;
  amount: number;
  loanInterestRate: number | null;
  loanOriginalPrincipal: number | null;
  loanStartDate: Date | string | null;
  loanOutstandingOverride: number | null;
  chitFund?: { startDate: Date | string; durationMonths: number } | null;
}): { month: number; year: number } | null {
  if (t.category === "LOAN" && t.loanInterestRate != null) {
    return computeLoanEndDate({
      emi: t.amount,
      annualRate: t.loanInterestRate,
      originalPrincipal: t.loanOriginalPrincipal,
      startDate: t.loanStartDate,
      outstandingOverride: t.loanOutstandingOverride,
    });
  }
  if (t.category === "CHIT_FUND" && t.chitFund?.startDate && t.chitFund?.durationMonths) {
    return computeChitEndDate(String(t.chitFund.startDate), t.chitFund.durationMonths);
  }
  return null;
}

// Single source of truth for "does this template still generate a bill in
// month/year" — manual end dates, computed loan/chit end dates, a chit
// fund's own start date, and a loan's own EMI start date all funnel
// through here. This used to be reimplemented independently in
// setup-month.ts (real entry creation), the Year View's month projections,
// and the dashboard's future-month projection — three separate copies of
// the same rule, which is exactly why a fix to one (e.g. the loan-start
// check) didn't apply to the other two until they were consolidated here.
export function isTemplateActiveInMonth(
  t: {
    category: string;
    amount: number;
    endsOnMonth: number | null;
    endsOnYear: number | null;
    loanInterestRate: number | null;
    loanOriginalPrincipal: number | null;
    loanStartDate: Date | string | null;
    loanOutstandingOverride: number | null;
    chitFund?: { startDate: Date | string; durationMonths: number } | null;
  },
  month: number,
  year: number,
): boolean {
  // Manual end date — loans/chit funds use their own computed end date
  // below instead, which is authoritative over this manual field for them.
  if (t.endsOnYear != null && t.endsOnMonth != null && t.category !== "LOAN" && t.category !== "CHIT_FUND") {
    if (year > t.endsOnYear) return false;
    if (year === t.endsOnYear && month > t.endsOnMonth) return false;
  }
  // Computed end date for loans and chit funds (amortization payoff / chit duration)
  const computedEnd = computeTemplateEndDate(t);
  if (computedEnd) {
    if (year > computedEnd.year) return false;
    if (year === computedEnd.year && month > computedEnd.month) return false;
  }
  // Chit fund: don't include months before the chit's own start date
  if (t.category === "CHIT_FUND" && t.chitFund?.startDate) {
    const chitStart = new Date(t.chitFund.startDate);
    const chitStartY = chitStart.getUTCFullYear();
    const chitStartM = chitStart.getUTCMonth() + 1;
    if (year < chitStartY || (year === chitStartY && month < chitStartM)) return false;
  }
  // Loan: don't include months before its own EMI start date
  if (t.category === "LOAN" && t.loanStartDate) {
    const loanStart = new Date(t.loanStartDate);
    const loanStartY = loanStart.getUTCFullYear();
    const loanStartM = loanStart.getUTCMonth() + 1;
    if (year < loanStartY || (year === loanStartY && month < loanStartM)) return false;
  }
  return true;
}

export function computeChitCurrentMonth(startDateStr: string): number {
  const start = new Date(startDateStr);
  const now = new Date();
  const elapsed = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth());
  return Math.max(1, elapsed + 1);
}

export type LoanAmortization = {
  outstandingPrincipal: number;
  interestThisMonth: number;
  principalThisMonth: number;
  totalInterestRemaining: number;
  monthsRemaining: number;
  isOverride: boolean; // true when based on user-supplied outstanding
};

function monthsDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function computeLoanAmortization(params: {
  emi: number;
  annualRate: number;
  originalPrincipal?: number | null;
  startDate?: Date | string | null;
  outstandingOverride?: number | null;
  today?: Date;
  isPaidThisMonth?: boolean;
}): LoanAmortization | null {
  const { emi, annualRate, originalPrincipal, startDate, outstandingOverride, isPaidThisMonth } = params;
  const today = params.today ?? new Date();

  if (!emi || !annualRate) return null;

  const r = annualRate / 12 / 100; // monthly rate
  if (r <= 0) return null;

  let outstanding: number;
  let isOverride = false;

  if (outstandingOverride != null && outstandingOverride > 0) {
    // User-supplied current outstanding (most accurate for floating rate / old loans)
    outstanding = outstandingOverride;
    isOverride = true;
  } else if (originalPrincipal && startDate) {
    // Compute remaining principal from formula after k payments
    // isPaidThisMonth: if true, the current month's EMI is already paid → add 1 to k
    const start = typeof startDate === "string" ? new Date(startDate) : startDate;
    const k = Math.max(0, monthsDiff(start, today) + (isPaidThisMonth ? 1 : 0));
    // P_k = P*(1+r)^k - EMI*((1+r)^k - 1)/r
    const factor = Math.pow(1 + r, k);
    outstanding = originalPrincipal * factor - (emi * (factor - 1)) / r;
    outstanding = Math.max(0, outstanding);
  } else {
    return null;
  }

  const interestThisMonth = outstanding * r;
  const principalThisMonth = Math.min(emi - interestThisMonth, outstanding);

  // Remaining months = log(EMI / (EMI - outstanding*r)) / log(1+r)
  let monthsRemaining = 0;
  if (outstanding * r < emi) {
    monthsRemaining = Math.ceil(Math.log(emi / (emi - outstanding * r)) / Math.log(1 + r));
  }

  const totalInterestRemaining = Math.max(0, monthsRemaining * emi - outstanding);

  return {
    outstandingPrincipal: Math.round(outstanding),
    interestThisMonth: Math.round(interestThisMonth),
    principalThisMonth: Math.max(0, Math.round(principalThisMonth)),
    totalInterestRemaining: Math.round(totalInterestRemaining),
    monthsRemaining,
    isOverride,
  };
}
