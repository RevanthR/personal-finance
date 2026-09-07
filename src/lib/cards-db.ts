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

export type CardBillLine = { templateId: string; name: string; amount: number; basis: CardBillBasis };
export type MonthlyCardBills = { total: number; byCard: CardBillLine[] };

/**
 * What the credit cards cost per calendar month, for a requested set of
 * months (past, current or future). A card's cost in month M is the
 * statement due in M (see cardBillForMonth): the confirmed bank figure, the
 * closed cycle's charge sum, or a projection for a cycle that hasn't
 * closed. This is the GROSS billed figure (a spend/cost view) — payments
 * made against it don't reduce it; "what's still owed right now" is a
 * separate question that cardStatus() answers for the live month.
 * Every screen that shows "what the cards cost in month M" reads this.
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
    for (const { month, year } of months) out.set(`${year}-${month}`, { total: 0, byCard: [] });
    return out;
  }

  // Charges: back far enough to cover the earliest requested month's cycle
  // and the trailing-median lookback (4 cycles before now).
  const earliest = months.reduce((min, m) => {
    const t = Date.UTC(m.year, m.month - 1, 1);
    return t < min ? t : min;
  }, asOf.getTime());
  const since = new Date(earliest);
  since.setUTCMonth(since.getUTCMonth() - 18);

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

  for (const { month, year } of months) {
    const byCard: CardBillLine[] = [];
    let total = 0;
    for (const card of cards) {
      if (!card.template.isActive) continue;
      const bill = cardBillForMonth(
        { statementDay: card.template.statementDay, dueDateDay: card.template.dueDateDay, creditLimit: card.template.creditLimit },
        card.statements.map(toRow),
        chargesByCard.get(card.templateId) ?? [],
        month, year, asOf,
      );
      if (bill.gross <= 0) continue;
      byCard.push({ templateId: card.template.id, name: card.template.name, amount: bill.gross, basis: bill.basis });
      total = Math.round((total + bill.gross) * 100) / 100;
    }
    byCard.sort((a, b) => b.amount - a.amount);
    out.set(`${year}-${month}`, { total, byCard });
  }
  return out;
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
