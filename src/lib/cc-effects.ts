import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export type EntryFields = { id: string; amount: number; statementAmount: number | null; billedAmount: number | null };

// Every function here takes the DB client as its first argument — either
// the plain singleton (`db`) or a `Prisma.TransactionClient` — so callers
// that need the AdHocItem write and this CC-effect write to succeed or
// fail together can pass a `tx` from `db.$transaction(...)` instead of two
// separate, independently-committing round trips.
type DbClient = typeof db | Prisma.TransactionClient;

// Recompute statementAmount for a CC card from ALL current post-close
// adHocItems linked to it. Idempotent and self-healing regardless of past
// accumulation bugs — always re-sums live rows rather than adjusting deltas.
async function recomputeStatementAmount(
  client: DbClient,
  entryId: string,
  monthId: string,
  ccTemplateId: string,
  statementDay: number | null,
): Promise<EntryFields> {
  const cardItems = await client.adHocItem.findMany({
    where: { monthId, type: "EXPENSE", ccTemplateId },
    select: { amount: true, date: true },
  });

  const postCloseTotal = cardItems
    .filter(i => {
      const day = new Date(i.date).getDate();
      return statementDay === null || day > statementDay;
    })
    .reduce((sum, i) => sum + i.amount, 0);

  return client.monthlyEntry.update({
    where: { id: entryId },
    data: { statementAmount: postCloseTotal },
    select: { id: true, amount: true, statementAmount: true, billedAmount: true },
  });
}

// Apply a CC charge's effect onto its card's MonthlyEntry (creating the
// entry if this is the first charge against it this month).
export async function applyCCEffect(
  client: DbClient,
  userId: string,
  monthId: string,
  ccTemplateId: string,
  date: Date,
  amount: number,
): Promise<EntryFields | null> {
  const template = await client.lineItemTemplate.findFirst({
    where: { id: ccTemplateId, userId, category: "CREDIT_CARD" },
  });
  if (!template) return null;

  let entry = await client.monthlyEntry.findUnique({
    where: { monthId_templateId: { monthId, templateId: ccTemplateId } },
  });
  if (!entry) {
    entry = await client.monthlyEntry.create({
      data: { monthId, templateId: ccTemplateId, amount: 0, billedAmount: 0, isPaid: false, statementAmount: 0 },
    });
  }

  const statementDay = template.statementDay ?? null;
  const isPreClose = statementDay !== null && date.getDate() <= statementDay;

  if (isPreClose) {
    return client.monthlyEntry.update({
      where: { id: entry.id },
      data: {
        amount: entry.amount + amount,
        billedAmount: (entry.billedAmount ?? entry.amount) + amount,
      },
      select: { id: true, amount: true, statementAmount: true, billedAmount: true },
    });
  }
  return recomputeStatementAmount(client, entry.id, monthId, ccTemplateId, statementDay);
}

// Reverse a CC charge's effect off its card's MonthlyEntry. Call this
// BEFORE the AdHocItem row is deleted (post-close needs it excluded from
// the live re-sum) or AFTER it's been updated to new values (edit — the
// captured old amount is used for the delta, not the row's current state).
export async function reverseCCEffect(
  client: DbClient,
  userId: string,
  monthId: string,
  ccTemplateId: string,
  date: Date,
  amount: number,
): Promise<EntryFields | null> {
  const entry = await client.monthlyEntry.findFirst({
    where: { monthId, template: { id: ccTemplateId, category: "CREDIT_CARD", userId } },
    select: {
      id: true, amount: true, statementAmount: true, billedAmount: true,
      template: { select: { statementDay: true } },
    },
  });
  if (!entry) return null;

  const statementDay = entry.template.statementDay ?? null;
  const isPreClose = statementDay !== null && date.getDate() <= statementDay;

  if (isPreClose) {
    return client.monthlyEntry.update({
      where: { id: entry.id },
      data: {
        amount: Math.max(0, entry.amount - amount),
        billedAmount: Math.max(0, (entry.billedAmount ?? entry.amount) - amount),
      },
      select: { id: true, amount: true, statementAmount: true, billedAmount: true },
    });
  }
  return recomputeStatementAmount(client, entry.id, monthId, ccTemplateId, statementDay);
}
