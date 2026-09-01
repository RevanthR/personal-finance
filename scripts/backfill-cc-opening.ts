/**
 * Backfill for the stale CC opening-balance bug.
 *
 * MonthlyEntry.openingAmount is frozen at month-open from the previous
 * month's statementAmount. A charge added to the previous month afterwards
 * (Gmail sync backfilling an older alert, a late manual entry) bumped that
 * month's statementAmount but never reflowed into this month's opening, so
 * the current cycle's `amount` silently under-counts. cc-effects.ts now
 * derives the opening live going forward; this one-off pass fixes the rows
 * that already drifted.
 *
 *   npx tsx scripts/backfill-cc-opening.ts                     # dry run
 *   npx tsx scripts/backfill-cc-opening.ts --apply
 *   npx tsx scripts/backfill-cc-opening.ts --apply --email revanth --card "Amazon Pay"
 *
 * Scope is deliberately narrow: only the CURRENT and NEXT month, only an
 * UNPAID entry that still looks untouched (amount == openingAmount,
 * billedAmount == amount, no billPaymentsAttributed). Paid historical
 * months are left alone — their `amount` already fed the cash-balance
 * carry-forward and rewriting it would ripple through past ledgers. A
 * manually "set bill" / bank-confirmed statement is never overwritten.
 *
 * NOTE: for a card whose bill has already generated, the recomputed amount
 * is the sum of every captured charge in the cycle. If the bank's real
 * statement billed less (late charges it cut before), that is the correct
 * number and this backfill would be wrong for that card — check the bank
 * statement and use --card to apply selectively.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computePrevCCState } from "../src/lib/entry-amount";
import { isPreCloseDate } from "../src/lib/finance-utils";
import { prevMonthYear } from "../src/lib/utils";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const EMAIL = arg("--email");
const CARD = arg("--card");
const EPS = 0.5;
const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// Current month and next month only.
function targetMonths(): { month: number; year: number }[] {
  const now = new Date();
  return [0, 1].map(k => {
    const d = new Date(now.getFullYear(), now.getMonth() + k, 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  });
}

async function main() {
  const users = await db.user.findMany({
    where: EMAIL ? { email: { contains: EMAIL, mode: "insensitive" } } : undefined,
    select: { id: true, email: true },
  });

  let openingFixes = 0, amountFixes = 0, skipped = 0;

  for (const u of users) {
    const ccTemplates = await db.lineItemTemplate.findMany({
      where: {
        userId: u.id, category: "CREDIT_CARD",
        ...(CARD ? { name: { contains: CARD, mode: "insensitive" } } : {}),
      },
      select: { id: true, name: true, statementDay: true },
    });
    if (ccTemplates.length === 0) continue;

    for (const t of ccTemplates) {
      for (const { month, year } of targetMonths()) {
        const entry = await db.monthlyEntry.findFirst({
          where: { templateId: t.id, month: { userId: u.id, month, year } },
          select: {
            id: true, monthId: true, amount: true, billedAmount: true, statementAmount: true,
            openingAmount: true, carriedInAmount: true, cashbackAmount: true, isPaid: true,
            paidAmount: true, billPaymentsAttributed: true,
          },
        });
        if (!entry) continue;
        if (entry.isPaid) continue; // never rewrite a settled month

        const { month: pm, year: py } = prevMonthYear(month, year);
        const prevEntry = await db.monthlyEntry.findFirst({
          where: { templateId: t.id, month: { userId: u.id, month: pm, year: py } },
          select: { statementAmount: true, isPaid: true, amount: true, billedAmount: true, paidAmount: true, cashbackAmount: true },
        });
        // No previous entry at all means no data to carry from — the live
        // path would legitimately open at 0, but a backfill zeroing a real
        // historical balance is almost certainly wrong, so skip.
        if (!prevEntry) continue;

        const s = computePrevCCState(prevEntry);
        const liveOpening = Math.max(0, s.statement + s.outstanding);
        if (Math.abs(liveOpening - entry.openingAmount) < EPS) continue; // already correct

        // Pre-close charges on this month, for the recomputed amount.
        const charges = await db.adHocItem.findMany({
          where: { monthId: entry.monthId, type: "EXPENSE", ccTemplateId: t.id },
          select: { amount: true, date: true, isCredit: true },
        });
        const preClose = charges
          .filter(c => t.statementDay != null && isPreCloseDate(new Date(c.date), t.statementDay))
          .reduce((sum, c) => sum + (c.isCredit ? -c.amount : c.amount), 0);
        const newAmount = Math.max(0, liveOpening + preClose + (entry.billPaymentsAttributed ?? 0));

        const untouched =
          Math.abs(entry.amount - entry.openingAmount) < EPS &&
          (entry.billedAmount == null || Math.abs(entry.billedAmount - entry.amount) < EPS) &&
          (entry.billPaymentsAttributed ?? 0) === 0;

        const tag = `${u.email}  ${t.name}  ${String(month).padStart(2, "0")}/${year}`;
        if (untouched) {
          console.log(`${tag}\n    opening ${money(entry.openingAmount)} -> ${money(liveOpening)}   amount ${money(entry.amount)} -> ${money(newAmount)}   (stmt ${money(entry.statementAmount ?? 0)}, preClose ${money(preClose)})`);
          openingFixes++;
          amountFixes++;
          if (APPLY) {
            await db.monthlyEntry.update({
              where: { id: entry.id },
              data: { openingAmount: liveOpening, amount: newAmount, billedAmount: newAmount },
            });
          }
        } else {
          console.log(`${tag}\n    SKIP amount ${money(entry.amount)} (manual: opening ${money(entry.openingAmount)}, billed ${entry.billedAmount == null ? "null" : money(entry.billedAmount)}, billPayAttr ${money(entry.billPaymentsAttributed ?? 0)}); would-be ${money(newAmount)}`);
          skipped++;
        }
      }
    }
  }

  console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"} — ${openingFixes} opening refresh, ${amountFixes} amount rewrite, ${skipped} amount kept (manual).`);
  if (!APPLY && openingFixes > 0) console.log("Re-run with --apply to write.");
  await db.$disconnect();
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
