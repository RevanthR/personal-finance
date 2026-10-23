import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  cardStatus, cardBillForMonth, cardLedger, currentCycleOpen, prevStatementDate, dueDateFor, statementDateFor,
  type CardStatementRow, type CardStatusResult, type CardBillBasis, type CardCycle,
} from "@/lib/cards";
import { recordCardCashDelta } from "@/lib/cash-payment";

type DbClient = typeof db | Prisma.TransactionClient;

// Charges older than this can't affect any current figure and only bloat
// the payload. 14 months covers the current cycle plus a year of history
// for the statement list.
const CHARGE_WINDOW_MONTHS = 14;

export type CardChargeRow = { id: string; date: Date; amount: number; isCredit: boolean; isCardRepayment: boolean; name: string };

export type CardOverview = {
  cardId: string;
  templateId: string;
  name: string;
  bank: string | null;
  network: string | null;
  last4: string | null;
  statementDay: number | null;
  dueDateDay: number | null;
  creditLimit: number | null;
  isActive: boolean;
  status: CardStatusResult;
  /** Closed billing cycles, newest first, for the statement history sheet. */
  cycles: CardCycle[];
  charges: CardChargeRow[];
};

function toRow(s: {
  statementDate: Date; paymentDueDate: Date; statementBalance: number | null;
  confirmedAt: Date | null; paidAmount: number; paidInFull: boolean; paidAt: Date | null; cashback: number;
}): CardStatementRow {
  return {
    statementDate: s.statementDate,
    paymentDueDate: s.paymentDueDate,
    statementBalance: s.statementBalance,
    confirmedAt: s.confirmedAt,
    paidAmount: s.paidAmount,
    paidInFull: s.paidInFull,
    paidAt: s.paidAt,
    cashback: s.cashback,
  };
}

/** Every card for a user with its derived status. One query set. */
export async function getCardsOverview(userId: string, asOf: Date = new Date()): Promise<CardOverview[]> {
  const cards = await db.creditCard.findMany({
    where: { userId },
    include: {
      template: { select: { id: true, name: true, isActive: true, statementDay: true, dueDateDay: true, creditLimit: true } },
      statements: { orderBy: { statementDate: "desc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (cards.length === 0) return [];

  const since = new Date(asOf);
  since.setUTCMonth(since.getUTCMonth() - CHARGE_WINDOW_MONTHS);
  const templateIds = cards.map(c => c.templateId);
  const charges = await db.adHocItem.findMany({
    where: { type: "EXPENSE", ccTemplateId: { in: templateIds }, date: { gte: since }, month: { userId } },
    select: { id: true, ccTemplateId: true, date: true, amount: true, isCredit: true, isCardRepayment: true, name: true },
    orderBy: { date: "desc" },
  });
  const chargesByTemplate = new Map<string, CardChargeRow[]>();
  for (const c of charges) {
    const list = chargesByTemplate.get(c.ccTemplateId!) ?? [];
    list.push({ id: c.id, date: c.date, amount: c.amount, isCredit: c.isCredit, isCardRepayment: c.isCardRepayment, name: c.name });
    chargesByTemplate.set(c.ccTemplateId!, list);
  }

  return cards.map(c => {
    const cardCharges = chargesByTemplate.get(c.templateId) ?? [];
    const statementRows = c.statements.map(toRow);
    const t = c.template;
    return {
      cardId: c.id,
      templateId: c.templateId,
      name: t.name,
      bank: c.bank,
      network: c.network,
      last4: c.last4,
      statementDay: t.statementDay,
      dueDateDay: t.dueDateDay,
      creditLimit: t.creditLimit,
      isActive: t.isActive,
      status: cardStatus(
        { statementDay: t.statementDay, dueDateDay: t.dueDateDay, creditLimit: t.creditLimit },
        statementRows,
        cardCharges,
        asOf,
      ),
      cycles: t.statementDay == null
        ? []
        : cardLedger(t.statementDay, t.dueDateDay, statementRows, cardCharges, asOf).cycles
            .filter(cy => cy.tracked || cy.gross > 0)
            .reverse(),
      charges: cardCharges,
    };
  });
}

export type CardBillLine = { templateId: string; name: string; amount: number; paid: number; cashback: number; unbilled: number; basis: CardBillBasis };
export type MonthlyCardBills = {
  /** Σ gross billed this month (before payments/cashback) — the cost view.
   * Zero for a card whose cycle due this month hasn't closed yet; that
   * card's running spend is in `unbilled` instead, never here. */
  total: number;
  /** Σ payments (Pay button + card repayment entries) against those statements. */
  paid: number;
  /** Σ cashback credited on those statements. */
  cashback: number;
  /** Σ charges booked into a cycle that hasn't closed yet — not a real bill,
   * see projectedCardTotal() for folding this into a forward estimate. */
  unbilled: number;
  byCard: CardBillLine[];
};

export const EMPTY_CARD_BILLS: MonthlyCardBills = { total: 0, paid: 0, cashback: 0, unbilled: 0, byCard: [] };

/**
 * What the credit cards cost per calendar month, for a requested set of
 * months (past, current or future). A card's cost in month M is the
 * statement due in M (see cardBillForMonth): the confirmed bank figure, the
 * closed cycle's charge sum, or (for an unclosed cycle) zero, with the
 * running spend reported separately as `unbilled`. `total` is the GROSS
 * billed figure (a spend/cost view); `paid` / `cashback` are alongside so a
 * caller can also derive what's still owed (total - paid - cashback). For a
 * forward ESTIMATE of a month that hasn't happened yet, run it through
 * projectedCardTotal() first so an accruing cycle isn't shown as a flat 0.
 */
export async function getCardBillsByMonth(
  userId: string,
  months: { month: number; year: number }[],
  asOf: Date = new Date(),
): Promise<Map<string, MonthlyCardBills>> {
  const out = new Map<string, MonthlyCardBills>();
  if (months.length === 0) return out;

  const cards = await db.creditCard.findMany({
    where: { userId },
    include: {
      template: { select: { id: true, name: true, isActive: true, statementDay: true, dueDateDay: true, creditLimit: true } },
      statements: { orderBy: { statementDate: "desc" } },
    },
  });
  if (cards.length === 0) {
    for (const { month, year } of months) out.set(`${year}-${month}`, { ...EMPTY_CARD_BILLS, byCard: [] });
    return out;
  }

  // Charges: back far enough to cover the earliest requested month's cycle,
  // and never less than the overview's window so both screens apply
  // repayments over the same history.
  const earliest = months.reduce((min, m) => {
    const t = Date.UTC(m.year, m.month - 1, 1);
    return t < min ? t : min;
  }, asOf.getTime());
  const since = new Date(earliest);
  since.setUTCMonth(since.getUTCMonth() - 4);
  const windowStart = new Date(asOf);
  windowStart.setUTCMonth(windowStart.getUTCMonth() - CHARGE_WINDOW_MONTHS);
  if (windowStart < since) since.setTime(windowStart.getTime());

  const charges = await db.adHocItem.findMany({
    where: { type: "EXPENSE", ccTemplateId: { in: cards.map(c => c.templateId) }, date: { gte: since }, month: { userId } },
    select: { ccTemplateId: true, date: true, amount: true, isCredit: true, isCardRepayment: true },
    orderBy: { date: "desc" },
  });
  const chargesByCard = new Map<string, { date: Date; amount: number; isCredit: boolean; isCardRepayment: boolean }[]>();
  for (const c of charges) {
    const l = chargesByCard.get(c.ccTemplateId!) ?? [];
    l.push({ date: c.date, amount: c.amount, isCredit: c.isCredit, isCardRepayment: c.isCardRepayment });
    chargesByCard.set(c.ccTemplateId!, l);
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  for (const { month, year } of months) {
    const byCard: CardBillLine[] = [];
    let total = 0, paid = 0, cashback = 0, unbilled = 0;
    for (const card of cards) {
      if (!card.template.isActive) continue;
      const bill = cardBillForMonth(
        { statementDay: card.template.statementDay, dueDateDay: card.template.dueDateDay, creditLimit: card.template.creditLimit },
        card.statements.map(toRow),
        chargesByCard.get(card.templateId) ?? [],
        month, year, asOf,
      );
      if (bill.gross <= 0 && bill.unbilled <= 0) continue;
      byCard.push({ templateId: card.template.id, name: card.template.name, amount: bill.gross, paid: bill.paid, cashback: bill.cashback, unbilled: bill.unbilled, basis: bill.basis });
      total = r2(total + bill.gross);
      paid = r2(paid + bill.paid);
      cashback = r2(cashback + bill.cashback);
      unbilled = r2(unbilled + bill.unbilled);
    }
    byCard.sort((a, b) => (b.amount + b.unbilled) - (a.amount + a.unbilled));
    out.set(`${year}-${month}`, { total, paid, cashback, unbilled, byCard });
  }
  return out;
}

/**
 * What's still outstanding on a card for a forward ESTIMATE of a month not
 * yet lived through: the bill net of whatever's already been paid or
 * credited back, plus the next cycle's running spend so far. Never use this
 * for a month's real Payables / Pending / recorded expense: an unbilled
 * cycle is not an obligation yet, see MonthlyCardBills.unbilled.
 */
export function projectedCardTotal(bills: MonthlyCardBills): { total: number; byCard: { templateId: string; name: string; amount: number }[] } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const byCard = bills.byCard
    .map(c => ({ templateId: c.templateId, name: c.name, amount: r2(Math.max(0, c.amount - c.paid - c.cashback) + c.unbilled) }))
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  return { total: r2(byCard.reduce((s, c) => s + c.amount, 0)), byCard };
}

type CardKey = { id: string; userId: string; statementDay: number | null; dueDateDay: number | null };

/** Get or create the CardStatement row for one cycle, by its statement date. */
async function getOrCreateStatement(client: DbClient, card: CardKey & { statementDay: number }, statementDate: Date) {
  return client.cardStatement.upsert({
    where: { cardId_statementDate: { cardId: card.id, statementDate } },
    create: {
      cardId: card.id,
      userId: card.userId,
      cycleStart: prevStatementDate(card.statementDay, statementDate),
      statementDate,
      paymentDueDate: dueDateFor(statementDate, card.statementDay, card.dueDateDay ?? card.statementDay),
    },
    update: {},
  });
}

/**
 * Get or create the CardStatement row for the cycle that most recently
 * closed (the one "confirm" targets). Null when the card has no statement day.
 */
export async function getOrCreateLatestStatement(client: DbClient, card: CardKey, asOf: Date = new Date()) {
  if (card.statementDay == null) return null;
  return getOrCreateStatement(client, { ...card, statementDay: card.statementDay }, currentCycleOpen(card.statementDay, asOf));
}

export type CardPayment = { kind: "full" } | { kind: "amount"; amount: number } | { kind: "undo" };

/**
 * Record a card payment made with the Pay button or matched from a Gmail
 * bill-payment email. Money goes to the OLDEST unpaid statement first (a
 * past-due one), then the latest; any extra sits on the latest statement.
 * `full` clears everything owed. `undo` reverses the latest statement's
 * recorded payment. Every change also writes a CashPayment row.
 * Returns whether anything is still owed afterwards.
 */
export async function recordCardPayment(userId: string, cardId: string, payment: CardPayment): Promise<{ ok: true; stillOwed: number } | { ok: false; error: string }> {
  const card = await db.creditCard.findFirst({
    where: { id: cardId, userId },
    select: { id: true, userId: true, template: { select: { statementDay: true, dueDateDay: true } } },
  });
  if (!card) return { ok: false, error: "Card not found" };
  const sd = card.template.statementDay;
  if (sd == null) return { ok: false, error: "Set a statement date on this card first" };
  const key = { id: card.id, userId: card.userId, statementDay: sd, dueDateDay: card.template.dueDateDay };

  const overview = (await getCardsOverview(userId)).find(c => c.cardId === cardId);
  const unpaid = overview?.status.unpaidStatements ?? [];
  const latestDate = currentCycleOpen(sd, new Date());

  await db.$transaction(async (tx) => {
    const now = new Date();
    const pay = async (statementDate: Date, amount: number, clears: boolean) => {
      const row = await getOrCreateStatement(tx, key, statementDate);
      const newPaid = Math.round((row.paidAmount + amount) * 100) / 100;
      await tx.cardStatement.update({ where: { id: row.id }, data: { paidAmount: newPaid, paidInFull: clears, paidAt: now } });
      await recordCardCashDelta(tx, userId, row.id, row.paidAmount, newPaid, now);
    };

    if (payment.kind === "undo") {
      const row = await getOrCreateStatement(tx, key, latestDate);
      if (row.paidAmount === 0) return;
      await tx.cardStatement.update({ where: { id: row.id }, data: { paidAmount: 0, paidInFull: false, paidAt: null } });
      await recordCardCashDelta(tx, userId, row.id, row.paidAmount, 0, now);
      return;
    }

    if (payment.kind === "full") {
      for (const s of unpaid) await pay(new Date(s.statementDate), s.outstanding, true);
      return;
    }

    let left = payment.amount;
    for (const s of unpaid) {
      if (left <= 0) break;
      const take = Math.min(left, s.outstanding);
      await pay(new Date(s.statementDate), take, take >= s.outstanding - 1);
      left -= take;
    }
    if (left > 0.005) await pay(latestDate, left, true);
  });

  const after = (await getCardsOverview(userId)).find(c => c.cardId === cardId);
  return { ok: true, stillOwed: (after?.status.statementBalance ?? 0) + (after?.status.pastDue ?? 0) };
}

/**
 * A card's statement day or due day changed: move its CardStatement rows
 * onto the new dates (same calendar month), so confirmed figures and
 * payments stay attached to their cycle instead of being orphaned.
 */
export async function rekeyCardStatements(client: DbClient, templateId: string) {
  const card = await client.creditCard.findUnique({
    where: { templateId },
    select: { id: true, template: { select: { statementDay: true, dueDateDay: true } }, statements: { orderBy: { statementDate: "asc" } } },
  });
  const sd = card?.template.statementDay;
  if (!card || sd == null) return;
  const dd = card.template.dueDateDay ?? sd;
  for (const s of card.statements) {
    const statementDate = statementDateFor(s.statementDate.getUTCFullYear(), s.statementDate.getUTCMonth(), sd);
    const cycleStart = prevStatementDate(sd, statementDate);
    const paymentDueDate = dueDateFor(statementDate, sd, dd);
    if (statementDate.getTime() === s.statementDate.getTime()
      && cycleStart.getTime() === s.cycleStart.getTime()
      && paymentDueDate.getTime() === s.paymentDueDate.getTime()) continue;
    await client.cardStatement.update({ where: { id: s.id }, data: { statementDate, cycleStart, paymentDueDate } });
  }
}
