// Shared by the manual pay dialog (src/app/api/months/[monthId]/entries/route.ts)
// and the Gmail-approve "mark as paid" action — both need the same
// full-vs-partial payment resolution against a MonthlyEntry's net amount.
export function computePaymentUpdate(
  netAmount: number,
  paidAmount: number,
): { isPaid?: boolean; paidOn?: Date; paidAmount: number | null } {
  if (paidAmount >= netAmount) {
    // Preserve the actual amount paid when it exceeds netAmount (overpayment).
    return { isPaid: true, paidOn: new Date(), paidAmount: paidAmount > netAmount ? paidAmount : null };
  }
  return { paidAmount: paidAmount > 0 ? paidAmount : null };
}
