import { db } from "@/lib/db";

export type EntryFields = { id: string; amount: number; statementAmount: number | null; billedAmount: number | null };

// Recompute statementAmount for a CC card from ALL current post-close
// adHocItems linked to it. Idempotent and self-healing regardless of past
// accumulation bugs — always re-sums live rows rather than adjusting deltas.
async function recomputeStatementAmount(
  entryId: string,
  monthId: string,
  ccTemplateId: string,
  statementDay: number | null,
): Promise<EntryFields> {
  const cardItems = await db.adHocItem.findMany({
    where: { monthId, type: "EXPENSE", ccTemplateId },
    select: { amount: true, date: true },
  });

  const postCloseTotal = cardItems
    .filter(i => {
      const day = new Date(i.date).getDate();
      return statementDay === null || day > statementDay;
    })
    .reduce((sum, i) => sum + i.amount, 0);

  return db.monthlyEntry.update({
    where: { id: entryId },
    data: { statementAmount: postCloseTotal },
    select: { id: true, amount: true, statementAmount: true, billedAmount: true },
  });
}

// Apply a CC charge's effect onto its card's MonthlyEntry (creating the
// entry if this is the first charge against it this month).
export async function applyCCEffect(
  userId: string,
  monthId: string,
  ccTemplateId: string,
  date: Date,
  amount: number,
): Promise<EntryFields | null> {
  const template = await db.lineItemTemplate.findFirst({
    where: { id: ccTemplateId, userId, category: "CREDIT_CARD" },
  });
  if (!template) return null;

  let entry = await db.monthlyEntry.findUnique({
    where: { monthId_templateId: { monthId, templateId: ccTemplateId } },
  });
  if (!entry) {
    entry = await db.monthlyEntry.create({
      data: { monthId, templateId: ccTemplateId, amount: 0, billedAmount: 0, isPaid: false, statementAmount: 0 },
    });
  }

  const statementDay = template.statementDay ?? null;
  const isPreClose = statementDay !== null && date.getDate() <= statementDay;

  if (isPreClose) {
    return db.monthlyEntry.update({
      where: { id: entry.id },
      data: {
        amount: entry.amount + amount,
        billedAmount: (entry.billedAmount ?? entry.amount) + amount,
      },
      select: { id: true, amount: true, statementAmount: true, billedAmount: true },
    });
  }
  return recomputeStatementAmount(entry.id, monthId, ccTemplateId, statementDay);
}

// Reverse a CC charge's effect off its card's MonthlyEntry. Call this
// BEFORE the AdHocItem row is deleted (post-close needs it excluded from
// the live re-sum) or AFTER it's been updated to new values (edit — the
// captured old amount is used for the delta, not the row's current state).
export async function reverseCCEffect(
  userId: string,
  monthId: string,
  ccTemplateId: string,
  date: Date,
  amount: number,
): Promise<EntryFields | null> {
  const entry = await db.monthlyEntry.findFirst({
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
    return db.monthlyEntry.update({
      where: { id: entry.id },
      data: {
        amount: Math.max(0, entry.amount - amount),
        billedAmount: Math.max(0, (entry.billedAmount ?? entry.amount) - amount),
      },
      select: { id: true, amount: true, statementAmount: true, billedAmount: true },
    });
  }
  return recomputeStatementAmount(entry.id, monthId, ccTemplateId, statementDay);
}
