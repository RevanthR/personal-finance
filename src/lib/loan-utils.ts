export function computeLoanEndDate(params: {
  emi: number;
  annualRate: number;
  originalPrincipal?: number | null;
  startDate?: Date | string | null;
  outstandingOverride?: number | null;
}): { month: number; year: number } | null {
  const amort = computeLoanAmortization(params);
  if (!amort || amort.monthsRemaining <= 0) return null;
  const d = new Date();
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
