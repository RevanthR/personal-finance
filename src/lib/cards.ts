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

// ── Ledger ──────────────────────────────────────────────────────────────────
// Money moves on a card in three ways:
//  - a charge (AdHocItem with ccTemplateId): adds to the cycle it falls in
//  - a refund (isCredit): nets out of the cycle it falls in
//  - a repayment (isCardRepayment): money paid toward the card's bill. It is
//    NOT a refund, it pays a statement. It goes to the statement that was
//    current when it was paid, then any older unpaid statement, then the
//    next statements. Anything left over is credit against the open cycle.
// A CardStatement row adds what the bank said (statementBalance), payments
// recorded with the Pay button (paidAmount) and cashback.

export type CardCharge = {
  date: string | Date;
  amount: number;
  isCredit?: boolean | null;
  isCardRepayment?: boolean | null;
};

/** Below this, an amount still "owed" is rounding, not a real balance. */
const SLACK = 1;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type CardCycle = {
  statementDate: Date;
  cycleStart: Date;
  dueDate: Date;
  /** Has a CardStatement row, or is the most recently closed cycle. Older
   * cycles with no row are assumed settled outside the app. */
  tracked: boolean;
  confirmed: boolean;
  /** The bank figure once confirmed, else the charge-sum estimate. */
  gross: number;
  /** What the logged charges add up to, always. */
  estimated: number;
  /** Recorded via the Pay button / Gmail settle (CardStatement.paidAmount). */
  recordedPaid: number;
  /** Card repayment entries applied to this statement. */
  repaid: number;
  cashback: number;
  /** gross - recordedPaid - repaid - cashback, never negative. */
  outstanding: number;
};

const isRepayment = (c: CardCharge) => !!c.isCardRepayment;

/**
 * Every closed billing cycle from the first one with any activity up to the
 * most recently closed one, oldest first, with repayments applied.
 * `extraCredit` is repayment money left over after every closed statement
 * was paid off: it counts against the open cycle.
 */
export function cardLedger(
  statementDay: number,
  dueDay: number | null,
  statements: CardStatementRow[],
  charges: CardCharge[],
  asOf: Date,
): { cycles: CardCycle[]; extraCredit: number } {
  const sd = statementDay;
  const dd = dueDay ?? sd;
  const latest = currentCycleOpen(sd, asOf);

  // Earliest statement date that anything touches.
  let earliest = latest;
  for (const c of charges) {
    const d = new Date(c.date);
    const s = isRepayment(c) ? currentCycleOpen(sd, d) : nextCycleClose(sd, d);
    if (s < earliest) earliest = s;
  }
  for (const s of statements) {
    const d = new Date(s.statementDate);
    if (d < earliest) earliest = d;
  }

  const rowByTime = new Map(statements.map(s => [new Date(s.statementDate).getTime(), s]));
  const spend = charges.filter(c => !isRepayment(c));
  const cycles: CardCycle[] = [];
  for (let st = earliest, i = 0; st <= latest && i < 240; st = statementDateFor(st.getUTCFullYear(), st.getUTCMonth() + 1, sd), i++) {
    const row = rowByTime.get(st.getTime()) ?? null;
    const cycleStart = prevStatementDate(sd, st);
    const estimated = Math.max(0, sumBetween(spend, cycleStart, st));
    const confirmed = row?.confirmedAt != null && row.statementBalance != null;
    const gross = r2(confirmed ? row!.statementBalance! : estimated);
    const recordedPaid = r2(row?.paidAmount ?? 0);
    const cashback = r2(row?.cashback ?? 0);
    cycles.push({
      statementDate: st,
      cycleStart,
      dueDate: row ? new Date(row.paymentDueDate) : dueDateFor(st, sd, dd),
      tracked: row != null || st.getTime() === latest.getTime(),
      confirmed,
      gross,
      estimated,
      recordedPaid,
      repaid: 0,
      cashback,
      outstanding: Math.max(0, r2(gross - recordedPaid - cashback)),
    });
  }

  // Apply repayments, oldest first.
  let extraCredit = 0;
  const repayments = charges
    .filter(isRepayment)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  for (const p of repayments) {
    let left = p.amount;
    const target = currentCycleOpen(sd, new Date(p.date)).getTime();
    const ti = cycles.findIndex(c => c.statementDate.getTime() === target);
    const order = ti < 0
      ? cycles.filter(c => c.statementDate.getTime() > target)
      : [
          cycles[ti],
          ...cycles.slice(0, ti).filter(c => c.tracked),
          ...cycles.slice(ti + 1),
        ];
    for (const c of order) {
      if (left <= 0) break;
      const take = Math.min(left, c.outstanding);
      if (take <= 0) continue;
      c.repaid = r2(c.repaid + take);
      c.outstanding = r2(c.outstanding - take);
      left = r2(left - take);
    }
    extraCredit = r2(extraCredit + Math.max(0, left));
  }
  for (const c of cycles) if (c.outstanding < SLACK) c.outstanding = 0;

  return { cycles, extraCredit };
}

// ── Status ──────────────────────────────────────────────────────────────────

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
  /** Every statement still owing money (past due ones and the latest), oldest first. */
  unpaidStatements: { statementDate: Date; dueDate: Date; outstanding: number; confirmed: boolean }[];
};

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
  // unbilled (net of repayments) and show nothing as due.
  if (card.statementDay == null) {
    const spent = sumBetween(charges.filter(c => !isRepayment(c)), null, null);
    const repaid = charges.filter(isRepayment).reduce((s, c) => s + c.amount, 0);
    const total = Math.max(0, r2(spent - repaid));
    return {
      status: "unconfigured",
      statementBalance: 0, statementGross: 0, statementConfirmed: false, statementEstimated: 0,
      unbilledSpends: total, pastDue: 0, currentBalance: total,
      availableCredit: limit != null ? Math.max(0, limit - total) : null,
      utilisation: limit ? total / limit : null,
      cycleOpenDate: null, lastStatementDate: null, paymentDueDate: null, reconciliation: null,
      unpaidStatements: [],
    };
  }

  const sd = card.statementDay;
  const cycleOpen = currentCycleOpen(sd, asOf);
  const nextClose = nextCycleClose(sd, asOf);

  const { cycles, extraCredit } = cardLedger(sd, card.dueDateDay, statements, charges, asOf);
  const last = cycles[cycles.length - 1]; // always the cycle that closed at cycleOpen

  const spentThisCycle = Math.max(0, sumBetween(charges.filter(c => !isRepayment(c)), cycleOpen, nextClose));
  const unbilledSpends = Math.max(0, r2(spentThisCycle - extraCredit));

  const hasRow = statements.some(s => new Date(s.statementDate).getTime() === cycleOpen.getTime());
  const hasClosedCycle = hasRow || cycles.length > 1 || charges.some(c => !isRepayment(c) && new Date(c.date) < cycleOpen);

  // Past due: older tracked statements, due date passed, still owing.
  const pastDue = r2(cycles
    .slice(0, -1)
    .filter(c => c.tracked && c.dueDate < asOf)
    .reduce((s, c) => s + c.outstanding, 0));

  const statementBalance = last.outstanding;
  const currentBalance = r2(statementBalance + unbilledSpends + pastDue);
  const paidSomething = last.recordedPaid + last.repaid + last.cashback > 0;

  let status: CardStatusResult["status"];
  if (!hasClosedCycle) status = "open";
  else if (pastDue > 0) status = "pastdue";
  else if (statementBalance === 0 && (last.confirmed || paidSomething)) status = "paid";
  else if (!last.confirmed) status = "awaiting";
  else status = "confirmed";

  const delta = r2(last.gross - last.estimated);

  return {
    status,
    statementBalance,
    statementGross: last.gross,
    statementConfirmed: last.confirmed,
    statementEstimated: last.estimated,
    unbilledSpends,
    pastDue,
    currentBalance,
    availableCredit: limit != null ? Math.max(0, limit - currentBalance) : null,
    utilisation: limit ? currentBalance / limit : null,
    cycleOpenDate: cycleOpen,
    lastStatementDate: cycleOpen,
    paymentDueDate: card.dueDateDay != null ? last.dueDate : null,
    reconciliation: last.confirmed && Math.abs(delta) >= 1
      ? { logged: last.estimated, statement: last.gross, delta }
      : null,
    unpaidStatements: cycles
      .filter(c => c.tracked && c.outstanding > 0)
      .map(c => ({ statementDate: c.statementDate, dueDate: c.dueDate, outstanding: c.outstanding, confirmed: c.confirmed })),
  };
}

// ── Per-calendar-month bill ─────────────────────────────────────────────────

export type CardBillBasis = "confirmed" | "estimated" | "open" | "none";

export type CardBillForMonth = {
  /** The bill due this month, net of any recorded payment/cashback. ZERO
   * until the cycle actually closes — an open cycle's spend is `unbilled`,
   * not a bill. */
  amount: number;
  /** The full bill figure before payments/cashback. Zero until the cycle closes. */
  gross: number;
  /** Recorded payment against that statement (0 for an open/future cycle). */
  paid: number;
  /** Cashback credited on that statement. */
  cashback: number;
  /** Charges booked into a cycle that hasn't closed yet — informational
   * ("spent on the card this cycle"), never counted as a bill or as pending. */
  unbilled: number;
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
 *  - cycle NOT closed yet (open or future)   → the bill is 0; whatever's been charged so far is
 *                                              reported as `unbilled`, never as a payable. It
 *                                              becomes a bill only when the statement actually cuts.
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
    return { amount: 0, gross: 0, paid: 0, cashback: 0, unbilled: 0, basis: "none", statementDate: null, dueDate: null };
  }
  const sd = card.statementDay;
  const dd = card.dueDateDay ?? sd;
  const { statementDate, cycleStart, dueDate } = statementDueInMonth(sd, dd, month, year);

  const cycleClosed = statementDate.getTime() <= asOf.getTime();
  if (cycleClosed) {
    const { cycles } = cardLedger(sd, card.dueDateDay, statements, charges, asOf);
    const c = cycles.find(x => x.statementDate.getTime() === statementDate.getTime());
    if (!c) {
      return { amount: 0, gross: 0, paid: 0, cashback: 0, unbilled: 0, basis: "estimated", statementDate, dueDate };
    }
    return {
      amount: c.outstanding,
      gross: c.gross,
      paid: r2(c.recordedPaid + c.repaid),
      cashback: c.cashback,
      unbilled: 0,
      basis: c.confirmed ? "confirmed" : "estimated",
      statementDate, dueDate,
    };
  }

  // The cycle due this month hasn't closed yet. The bill is 0. Report what's
  // been charged into it so far as `unbilled` (a "spent this cycle" figure),
  // never a payable.
  const soFarEnd = asOf.getTime() > cycleStart.getTime()
    ? new Date(Math.min(asOf.getTime(), statementDate.getTime()))
    : cycleStart;
  const soFar = r2(Math.max(0, sumBetween(charges.filter(c => !isRepayment(c)), cycleStart, soFarEnd)));
  return { amount: 0, gross: 0, paid: 0, cashback: 0, unbilled: soFar, basis: "open", statementDate, dueDate };
}
