import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  cardStatus, cardBillForMonth, currentCycleOpen, prevStatementDate, dueDateFor,
  type CardStatementRow, type CardStatusResult, type CardBillBasis,
} from "@/lib/cards";

type DbClient = typeof db | Prisma.TransactionClient;

// Charges older than this can't affect any current figure and only bloat
// the payload. 14 months covers the current cycle plus a year of history
// for the statement list.
const CHARGE_WINDOW_MONTHS = 14;

export type CardChargeRow = { id: string; date: Date; amount: number; isCredit: boolean; name: string };

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
  statements: CardStatementRow[];
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
  since.setMonth(since.getMonth() - CHARGE_WINDOW_MONTHS);
  const templateIds = cards.map(c => c.templateId);
  const charges = await db.adHocItem.findMany({
    where: { type: "EXPENSE", ccTemplateId: { in: templateIds }, date: { gte: since }, month: { userId } },
    select: { id: true, ccTemplateId: true, date: true, amount: true, isCredit: true, name: true },
    orderBy: { date: "desc" },
  });
  const chargesByTemplate = new Map<string, CardChargeRow[]>();
  for (const c of charges) {
    const list = chargesByTemplate.get(c.ccTemplateId!) ?? [];
    list.push({ id: c.id, date: c.date, amount: c.amount, isCredit: c.isCredit, name: c.name });
    chargesByTemplate.set(c.ccTemplateId!, list);
  }

  return cards.map(c => {
    const cardCharges = chargesByTemplate.get(c.templateId) ?? [];
    const statementRows = c.statements.map(toRow);
    return {
      cardId: c.id,
      templateId: c.templateId,
      name: c.template.name,
      bank: c.bank,
      network: c.network,
      last4: c.last4,
      statementDay: c.template.statementDay,
      dueDateDay: c.template.dueDateDay,
      creditLimit: c.template.creditLimit,
      isActive: c.template.isActive,
      status: cardStatus(
        { statementDay: c.template.statementDay, dueDateDay: c.template.dueDateDay, creditLimit: c.template.creditLimit },
        statementRows,
        cardCharges,
        asOf,
      ),
      statements: statementRows,
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
  /** Σ payments recorded against those statements. */
  paid: number;
  /** Σ cashback credited on those statements. */
  cashback: number;
  /** Σ charges booked into a cycle that hasn't closed yet — not a real bill,
   * see projectedCardTotal() for folding this into a forward estimate. */
  unbilled: number;
  byCard: CardBillLine[];
};

/**
 * What the credit cards cost per calendar month, for a requested set of
 * months (past, current or future). A card's cost in month M is the
 * statement due in M (see cardBillForMonth): the confirmed bank figure, the
 * closed cycle's charge sum, or (for an unclosed cycle) zero, with the
 * running spend reported separately as `unbilled`. `total` is the GROSS
 * billed figure (a spend/cost view); `paid` / `cashback` are alongside so a
 * caller can also derive what's still owed on this month's statements
 * (total - paid - cashback). Every screen that shows "what the cards cost
 * in month M" reads this — for a month's REAL obligations (Payables,
 * Pending, a populated month's expense), use `total` as-is; for a forward
 * ESTIMATE of a month that hasn't happened yet, run it through
 * projectedCardTotal() first so an accruing cycle isn't shown as a flat 0
 * for the whole month.
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
    for (const { month, year } of months) out.set(`${year}-${month}`, { total: 0, paid: 0, cashback: 0, unbilled: 0, byCard: [] });
    return out;
  }

  // Charges: back far enough to cover the earliest requested month's cycle.
  const earliest = months.reduce((min, m) => {
    const t = Date.UTC(m.year, m.month - 1, 1);
    return t < min ? t : min;
  }, asOf.getTime());
  const since = new Date(earliest);
  since.setUTCMonth(since.getUTCMonth() - 4);

  const charges = await db.adHocItem.findMany({
    where: { type: "EXPENSE", ccTemplateId: { in: cards.map(c => c.templateId) }, date: { gte: since }, month: { userId } },
    select: { ccTemplateId: true, date: true, amount: true, isCredit: true },
    orderBy: { date: "desc" },
  });
  const chargesByCard = new Map<string, { date: Date; amount: number; isCredit: boolean }[]>();
  for (const c of charges) {
    const l = chargesByCard.get(c.ccTemplateId!) ?? [];
    l.push({ date: c.date, amount: c.amount, isCredit: c.isCredit });
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
 * yet lived through (a projected future month, or the year view's
 * not-yet-populated months): the bill net of whatever's already been paid
 * or credited back, plus the next cycle's running spend so far. Net of
 * payment matters here specifically because a statement can already be
 * fully paid off by the time its due date attributes it to a future month
 * (e.g. changing a card's payment day can retroactively move an
 * already-settled statement into next month's projection) — without
 * netting it out, a paid bill would show up as still owed.
 * Never use this for a month's real Payables / Pending / recorded expense:
 * an unbilled cycle is not an obligation yet, see MonthlyCardBills.unbilled.
 */
export function projectedCardTotal(bills: MonthlyCardBills): { total: number; byCard: { templateId: string; name: string; amount: number }[] } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const byCard = bills.byCard
    .map(c => ({ templateId: c.templateId, name: c.name, amount: r2(Math.max(0, c.amount - c.paid - c.cashback) + c.unbilled) }))
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  return { total: r2(byCard.reduce((s, c) => s + c.amount, 0)), byCard };
}

/**
 * Get or create the CardStatement row for the cycle that most recently
 * closed (the one a "confirm" or "pay" action targets). Returns null when
 * the card has no statement day, or no cycle has closed yet.
 */
export async function ensureCurrentStatement(
  client: DbClient,
  card: { id: string; userId: string; statementDay: number | null; dueDateDay: number | null },
  asOf: Date = new Date(),
) {
  if (card.statementDay == null) return null;
  const statementDate = currentCycleOpen(card.statementDay, asOf);
  const cycleStart = prevStatementDate(card.statementDay, statementDate);
  const paymentDueDate = dueDateFor(statementDate, card.statementDay, card.dueDateDay ?? card.statementDay);

  return client.cardStatement.upsert({
    where: { cardId_statementDate: { cardId: card.id, statementDate } },
    create: { cardId: card.id, userId: card.userId, cycleStart, statementDate, paymentDueDate },
    update: {},
  });
}
