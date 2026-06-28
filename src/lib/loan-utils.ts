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
}): LoanAmortization | null {
  const { emi, annualRate, originalPrincipal, startDate, outstandingOverride } = params;
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
    const start = typeof startDate === "string" ? new Date(startDate) : startDate;
    const k = Math.max(0, monthsDiff(start, today));
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
