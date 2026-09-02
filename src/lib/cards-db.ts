import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  cardStatus, currentCycleOpen, prevStatementDate, dueDateFor,
  type CardStatementRow, type CardStatusResult,
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
