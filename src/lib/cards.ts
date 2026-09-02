/**
 * Credit-card status, derived. One function every screen reads from.
 *
 * A card is stored as: its cycle config (statement day, due day, limit) plus
 * a CardStatement row per billing cycle holding the bank's confirmed figure,
 * payments, and cashback. Everything shown (unbilled spends, current balance,
 * utilisation, status) is calculated here from those rows plus the card's
 * AdHocItem charges. Nothing is re-summed on write; there is no stored
 * running balance to drift. See the CC rework note.
 *
 * No React, no DB imports. Pure, safe anywhere.
 */

// ── Cycle date math ─────────────────────────────────────────────────────────
// A card cuts its statement on a fixed day of the month. A day past the end
// of a short month (Feb, or the 31st) clamps to the last real day. Every
// date here is built at UTC midnight so it lines up with how AdHocItem
// dates come back from the DB, regardless of server timezone.

function daysInUtcMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** The statement date for a given month, clamped to a valid day. UTC midnight. */
export function statementDateFor(year: number, month0: number, statementDay: number): Date {
  return new Date(Date.UTC(year, month0, Math.min(statementDay, daysInUtcMonth(year, month0))));
}

/**
 * The most recent statement date that has already passed (today counts).
 * This is also the moment the currently-open cycle started accumulating.
 */
export function currentCycleOpen(statementDay: number, asOf: Date): Date {
  const thisMonth = statementDateFor(asOf.getUTCFullYear(), asOf.getUTCMonth(), statementDay);
  return asOf.getTime() >= thisMonth.getTime()
    ? thisMonth
    : statementDateFor(asOf.getUTCFullYear(), asOf.getUTCMonth() - 1, statementDay);
}

/** The next statement date, when the currently-open cycle will close. */
export function nextCycleClose(statementDay: number, asOf: Date): Date {
  const open = currentCycleOpen(statementDay, asOf);
  return statementDateFor(open.getUTCFullYear(), open.getUTCMonth() + 1, statementDay);
}

/** The statement date one cycle before `statementDate`. */
export function prevStatementDate(statementDay: number, statementDate: Date): Date {
  return statementDateFor(statementDate.getUTCFullYear(), statementDate.getUTCMonth() - 1, statementDay);
}

/**
 * The payment due date for a statement cut on `statementDate`. When the due
 * day is earlier in the month than the statement day, payment is due the
 * following month (a card that cuts the 25th and is due the 5th).
 */
export function dueDateFor(statementDate: Date, statementDay: number, dueDay: number): Date {
  const y = statementDate.getUTCFullYear();
  // Date.UTC normalises a month index of 12 into January of the next year.
  const m = statementDate.getUTCMonth() + (dueDay < statementDay ? 1 : 0);
  return new Date(Date.UTC(y, m, Math.min(dueDay, daysInUtcMonth(y, m))));
}

// ── Status ──────────────────────────────────────────────────────────────────

export type CardCharge = { date: string | Date; amount: number; isCredit?: boolean | null };

export type CardStatementRow = {
  statementDate: string | Date;
  paymentDueDate: string | Date;
  statementBalance: number | null;
  confirmedAt: string | Date | null;
  paidAmount: number;
  paidInFull: boolean;
  paidAt: string | Date | null;
  cashback: number;
};

export type CardConfig = {
  statementDay: number | null;
  dueDateDay: number | null;
  creditLimit: number | null;
};

export type CardStatusResult = {
  status: "unconfigured" | "open" | "awaiting" | "confirmed" | "paid" | "pastdue";
  /** Owed on the most recent statement, net of payments and cashback. Never negative. */
  statementBalance: number;
  /** The full statement figure before payments/cashback: the confirmed amount, else the estimate. */
  statementGross: number;
  /** True when statementBalance came from a confirmed bank figure rather than an estimate. */
  statementConfirmed: boolean;
  /** What the logged charges say the most recent statement is/was, always. Used for reconciliation. */
  statementEstimated: number;
  /** Spend in the cycle that has not closed yet. Always an estimate. */
  unbilledSpends: number;
  /** Unpaid balances from statements whose due date has passed. */
  pastDue: number;
  /** statementBalance + unbilledSpends + pastDue. */
  currentBalance: number;
  availableCredit: number | null;
  /** 0 to 1, or null when no credit limit is set. */
  utilisation: number | null;
  cycleOpenDate: Date | null;
  lastStatementDate: Date | null;
  paymentDueDate: Date | null;
  /**
   * Set only when the last statement is confirmed and the logged charges
   * for that cycle don't add up to it. delta > 0 means the statement is
   * higher than what was logged (fees, GST, interest, an EMI instalment, a
   * cashback that wasn't captured); delta < 0 means more was logged than
   * billed (a charge after the cut, or a duplicate).
   */
  reconciliation: { logged: number; statement: number; delta: number } | null;
};

/**
 * Cash that actually left toward this card's bills inside [from, to). Uses
 * paidAt, so it only counts payments recorded in that window rather than
 * the whole cumulative paidAmount.
 */
export function cardCashPaidBetween(statements: CardStatementRow[], from: Date, to: Date): number {
  let total = 0;
  for (const s of statements) {
    if (!s.paidAt) continue;
    const t = new Date(s.paidAt).getTime();
    if (t >= from.getTime() && t < to.getTime()) total += s.paidAmount;
  }
  return Math.round(total * 100) / 100;
}

const signed = (c: CardCharge) => (c.isCredit ? -c.amount : c.amount);

function sumBetween(charges: CardCharge[], startInclusive: Date | null, endExclusive: Date | null): number {
  let s = 0;
  for (const c of charges) {
    const d = new Date(c.date);
    if (startInclusive && d < startInclusive) continue;
    if (endExclusive && d >= endExclusive) continue;
    s += signed(c);
  }
  return Math.round(s * 100) / 100;
}

export function cardStatus(
  card: CardConfig,
  statements: CardStatementRow[],
  charges: CardCharge[],
  asOf: Date = new Date(),
): CardStatusResult {
  const limit = card.creditLimit ?? null;

  // No statement day set: cycles can't be placed. Treat every charge as
  // unbilled and show nothing as due.
  if (card.statementDay == null) {
    const total = Math.max(0, sumBetween(charges, null, null));
    return {
      status: "unconfigured",
      statementBalance: 0, statementGross: 0, statementConfirmed: false, statementEstimated: 0,
      unbilledSpends: total, pastDue: 0, currentBalance: total,
      availableCredit: limit != null ? Math.max(0, limit - total) : null,
      utilisation: limit ? total / limit : null,
      cycleOpenDate: null, lastStatementDate: null, paymentDueDate: null, reconciliation: null,
    };
  }

  const sd = card.statementDay;
  const cycleOpen = currentCycleOpen(sd, asOf);
  const nextClose = nextCycleClose(sd, asOf);
  const prevClose = prevStatementDate(sd, cycleOpen);

  const unbilledSpends = Math.max(0, sumBetween(charges, cycleOpen, nextClose));

  const earliestCharge = charges.reduce<Date | null>((min, c) => {
    const d = new Date(c.date);
    return !min || d < min ? d : min;
  }, null);
  const rowFor = (d: Date) =>
    statements.find(s => new Date(s.statementDate).getTime() === d.getTime()) ?? null;
  const lastRow = rowFor(cycleOpen);
  const hasClosedCycle = (earliestCharge != null && earliestCharge < cycleOpen) || lastRow != null;

  const statementEstimated = Math.max(0, sumBetween(charges, prevClose, cycleOpen));
  const confirmed = lastRow?.confirmedAt != null && lastRow.statementBalance != null;
  const gross = confirmed ? lastRow!.statementBalance! : statementEstimated;
  const paid = lastRow?.paidAmount ?? 0;
  const cashback = lastRow?.cashback ?? 0;
  const paidInFull = lastRow?.paidInFull ?? false;
  const statementBalance = Math.max(0, gross - paid - cashback);

  // Past due: earlier statements whose payment due date has passed, unpaid.
  let pastDue = 0;
  for (const s of statements) {
    const stDate = new Date(s.statementDate);
    if (stDate >= cycleOpen) continue;
    if (s.paidInFull) continue;
    if (new Date(s.paymentDueDate) >= asOf) continue;
    const g = s.confirmedAt != null && s.statementBalance != null
      ? s.statementBalance
      : Math.max(0, sumBetween(charges, prevStatementDate(sd, stDate), stDate));
    pastDue += Math.max(0, g - s.paidAmount - s.cashback);
  }
  pastDue = Math.round(pastDue * 100) / 100;

  const currentBalance = Math.round((statementBalance + unbilledSpends + pastDue) * 100) / 100;

  let status: CardStatusResult["status"];
  if (!hasClosedCycle) status = "open";
  else if (pastDue > 0) status = "pastdue";
  else if (!confirmed) status = "awaiting";
  else if (paidInFull || statementBalance <= 0) status = "paid";
  else status = "confirmed";

  const grossRounded = Math.round(gross * 100) / 100;
  const delta = Math.round((grossRounded - statementEstimated) * 100) / 100;

  return {
    status,
    statementBalance,
    statementGross: grossRounded,
    statementConfirmed: confirmed,
    statementEstimated,
    unbilledSpends,
    pastDue,
    currentBalance,
    availableCredit: limit != null ? Math.max(0, limit - currentBalance) : null,
    utilisation: limit ? currentBalance / limit : null,
    cycleOpenDate: cycleOpen,
    lastStatementDate: cycleOpen,
    paymentDueDate: card.dueDateDay != null ? dueDateFor(cycleOpen, sd, card.dueDateDay) : null,
    reconciliation: confirmed && Math.abs(delta) >= 1
      ? { logged: statementEstimated, statement: grossRounded, delta }
      : null,
  };
}
