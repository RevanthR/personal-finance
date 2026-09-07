import { db } from "@/lib/db";
import { isTemplateActiveInMonth } from "@/lib/loan-utils";
import { computeTemplateEntryAmount } from "@/lib/entry-amount";
import { pendingAmountKicks } from "@/lib/utils";
import type { Month } from "@/generated/prisma/client";

// Shared by POST /api/months (the user explicitly clicking "Start Month")
// and the dashboard page's silent auto-create for a brand-new account's
// very first month (no setup prompt at all) — same upsert-then-populate
// logic either way, just a different salaryIncome and a different caller.
export async function setupMonth(userId: string, month: number, year: number, salaryIncome?: number): Promise<Month> {
  // Atomic upsert instead of findUnique-then-create/update — two concurrent
  // requests for the same month/year previously could both see nothing and
  // both attempt to create, throwing an unhandled unique-constraint error.
  const monthRecord = await db.month.upsert({
    where: { userId_month_year: { userId, month, year } },
    create: { userId, month, year, salaryIncome: salaryIncome ?? 0 },
    update: salaryIncome !== undefined ? { salaryIncome } : {},
  });

  // Auto-populate entries from active templates if not done yet
  if (!monthRecord.isPopulated) {
    const templates = await db.lineItemTemplate.findMany({
      where: { userId, isActive: true },
      include: { chitFund: true },
    });

    // Every write below is one atomic unit — a mid-way failure (timeout,
    // dropped connection) now rolls back entirely instead of leaving
    // isPopulated false with some entries/templates already committed,
    // which previously made a retry redo (and duplicate, e.g. carry-forward
    // AdHocItems) whatever had already gone through.
    await db.$transaction(async (tx) => {
      for (const t of templates) {
        // Income and credit-card templates don't create entries. Income just
        // informs income pre-fill; cards run off CardStatement + logged
        // charges (src/lib/cards.ts). Both still promote pending amounts so
        // template.amount stays current.
        if (t.templateType === "INCOME" || t.category === "CREDIT_CARD") {
          if (pendingAmountKicks(t, month, year)) {
            await tx.lineItemTemplate.update({
              where: { id: t.id },
              data: { amount: t.pendingAmount!, pendingAmount: null, pendingFromMonth: null, pendingFromYear: null },
            });
          }
          continue;
        }

        // Yearly templates only appear in their designated month
        if (t.frequency === "YEARLY" && t.dueMonth !== month) continue;

        // End dates, computed loan/chit payoff, chit start, loan EMI start —
        // one shared rule (src/lib/loan-utils.ts) instead of a re-derived
        // copy here, so a fix to the rule never needs to be re-applied
        // separately for real entry creation vs. the Year View's projections.
        if (!isTemplateActiveInMonth(t, month, year)) continue;

        // Promote pending amount if its effective month has arrived
        let baseAmount = t.amount;
        if (pendingAmountKicks(t, month, year)) {
          baseAmount = t.pendingAmount!;
          await tx.lineItemTemplate.update({
            where: { id: t.id },
            data: { amount: t.pendingAmount!, pendingAmount: null, pendingFromMonth: null, pendingFromYear: null },
          });
        }

        const { amount } = computeTemplateEntryAmount(t, baseAmount);

        await tx.monthlyEntry.upsert({
          where: { monthId_templateId: { monthId: monthRecord.id, templateId: t.id } },
          create: { monthId: monthRecord.id, templateId: t.id, amount },
          update: {},
        });
      }

      await tx.month.update({ where: { id: monthRecord.id }, data: { isPopulated: true } });
    }, { timeout: 15000 });

    monthRecord.isPopulated = true;
  }

  return monthRecord;
}
