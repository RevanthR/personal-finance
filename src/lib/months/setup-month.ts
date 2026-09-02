import { db } from "@/lib/db";
import { isTemplateActiveInMonth } from "@/lib/loan-utils";
import { computeTemplateEntryAmount } from "@/lib/entry-amount";
import { pendingAmountKicks, prevMonthYear } from "@/lib/utils";
import { computeMonthIncome, computeMetrics } from "@/lib/finance-utils";
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

    // Find previous month to carry the cash balance forward.
    const { month: prevMonthNum, year: prevYear } = prevMonthYear(month, year);
    const prevMonth = await db.month.findUnique({
      where: { userId_month_year: { userId, month: prevMonthNum, year: prevYear } },
      include: {
        entries: {
          select: {
            templateId: true, statementAmount: true,
            isPaid: true, amount: true, billedAmount: true, paidAmount: true, cashbackAmount: true,
            template: { select: { category: true, name: true, statementDay: true } },
          },
        },
        adHocItems: true,
      },
    });

    // Carry forward actual leftover cash: previous month's real net cash
    // flow (income actually received minus what was actually paid out —
    // unpaid bills correctly don't reduce this, since that money hasn't
    // left hand yet) on top of whatever it itself carried in. Unpaid bills
    // themselves are NOT copied into this month at all (see below) — they
    // stay payable against their real original entry, in their own month,
    // so paying one later correctly moves cash on the day it actually
    // happens instead of being silently pre-counted as spent here.
    let openingBalance = 0;
    if (prevMonth) {
      const incomeTemplates = templates.filter(t => t.templateType === "INCOME");
      const prevIncome = computeMonthIncome(prevMonth.adHocItems, incomeTemplates, prevMonthNum, prevYear, prevMonth.salaryIncome);
      const prevPaid = computeMetrics(prevMonth.entries, false, 0).totalPaid;
      const prevAdHocExpense = prevMonth.adHocItems
        .filter(i => i.type === "EXPENSE" && !i.ccTemplateId)
        .reduce((s, i) => s + i.amount, 0);
      // prevMonth.openingBalance is frozen (never mutated after that month
      // was populated) — carriedDebtPaid separately holds whatever real cash
      // left during prevMonth to settle bills from before prevMonth, so it
      // has to be subtracted here explicitly to keep the true cash total.
      openingBalance = prevMonth.openingBalance + (prevIncome - prevPaid - prevAdHocExpense) - prevMonth.carriedDebtPaid;
    }

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

      await tx.month.update({ where: { id: monthRecord.id }, data: { isPopulated: true, openingBalance } });
    }, { timeout: 15000 });

    monthRecord.isPopulated = true;
    monthRecord.openingBalance = openingBalance;
  }

  return monthRecord;
}
