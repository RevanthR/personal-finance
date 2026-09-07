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

/**
 * The statement whose payment falls due inside calendar month (month, year).
 * When the due day is earlier in the month than the statement day, the
 * statement that cut in the *previous* calendar month is the one due here
 * (a card that cuts the 25th, due the 5th: the 25 Aug statement is due 5 Sep).
 * `month` is 1-12.
 */
export function statementDueInMonth(
  statementDay: number,
  dueDay: number,
  month: number,
  year: number,
): { statementDate: Date; cycleStart: Date; dueDate: Date } {
  const cutInPrevMonth = dueDay < statementDay;
  const statementDate = statementDateFor(year, (month - 1) - (cutInPrevMonth ? 1 : 0), statementDay);
  return {
    statementDate,
    cycleStart: prevStatementDate(statementDay, statementDate),
    dueDate: dueDateFor(statementDate, statementDay, dueDay),
  };
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

// ── Per-calendar-month bill ─────────────────────────────────────────────────

export type CardBillBasis = "confirmed" | "estimated" | "projected" | "none";

export type CardBillForMonth = {
  /** What this card's bill for the month is, net of any recorded payment/cashback. */
  amount: number;
  /** The full figure before payments/cashback. */
  gross: number;
  basis: CardBillBasis;
  statementDate: Date | null;
  dueDate: Date | null;
};

/**
 * What a single card contributes to the bill due in calendar month
 * (month, year) — for ANY month, past or future. One rule, so the
 * dashboard, the month page and the Year View all agree.
 *
 *  - confirmed CardStatement for that cycle  → the bank figure, net of paid/cashback
 *  - cycle already closed, not confirmed     → sum of that cycle's charges (net of any recorded payment)
 *  - cycle still open or entirely future     → only the charges booked into it so far (0 for a
 *                                              cycle that hasn't started). Card spend is not a
 *                                              fixed obligation — it's never guessed forward, it
 *                                              just tracks up as real charges land.
 */
export function cardBillForMonth(
  card: CardConfig,
  statements: CardStatementRow[],
  charges: CardCharge[],
  month: number,
  year: number,
  asOf: Date = new Date(),
): CardBillForMonth {
  if (card.statementDay == null) {
    return { amount: 0, gross: 0, basis: "none", statementDate: null, dueDate: null };
  }
  const sd = card.statementDay;
  const dd = card.dueDateDay ?? sd;
  const { statementDate, cycleStart, dueDate } = statementDueInMonth(sd, dd, month, year);

  const row = statements.find(s => new Date(s.statementDate).getTime() === statementDate.getTime()) ?? null;
  const paid = row?.paidAmount ?? 0;
  const cashback = row?.cashback ?? 0;

  if (row?.confirmedAt != null && row.statementBalance != null) {
    return {
      amount: Math.max(0, Math.round((row.statementBalance - paid - cashback) * 100) / 100),
      gross: Math.round(row.statementBalance * 100) / 100,
      basis: "confirmed", statementDate, dueDate,
    };
  }

  const cycleClosed = statementDate.getTime() <= asOf.getTime();
  if (cycleClosed) {
    const est = Math.max(0, sumBetween(charges, cycleStart, statementDate));
    return {
      amount: Math.max(0, Math.round((est - paid - cashback) * 100) / 100),
      gross: est, basis: "estimated", statementDate, dueDate,
    };
  }

  // Open or future cycle: only what's actually been charged into it so far
  // (nothing for a cycle that hasn't started). Never projected forward.
  const soFarEnd = asOf.getTime() > cycleStart.getTime()
    ? new Date(Math.min(asOf.getTime(), statementDate.getTime()))
    : cycleStart;
  const soFar = Math.round(Math.max(0, sumBetween(charges, cycleStart, soFarEnd)) * 100) / 100;
  return { amount: soFar, gross: soFar, basis: "projected", statementDate, dueDate };
}
