/**
 * Read-only diagnostic. Dumps every CC template's MonthlyEntry ledger fields
 * alongside the raw AdHocItem charges linked to it, so the engine figure
 * (amount / billedAmount / statementAmount / openingAmount / carriedInAmount)
 * can be compared against what the captured transactions actually sum to.
 *
 * Run: npx tsx scripts/inspect-cc.ts [emailSubstring]
 * Does not write anything.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const money = (n: number | null | undefined) => (n == null ? "-" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const d = (x: Date) => new Date(x).toISOString().slice(0, 10);

async function main() {
  const emailFilter = process.argv[2];
  const users = await db.user.findMany({
    where: emailFilter ? { email: { contains: emailFilter, mode: "insensitive" } } : undefined,
    select: { id: true, email: true },
  });

  for (const u of users) {
    const ccTemplates = await db.lineItemTemplate.findMany({
      where: { userId: u.id, category: "CREDIT_CARD" },
      select: { id: true, name: true, statementDay: true, dueDateDay: true, creditLimit: true, isActive: true },
    });
    if (ccTemplates.length === 0) continue;
    console.log(`\n================ ${u.email} ================`);

    for (const t of ccTemplates) {
      console.log(`\n### ${t.name}  (generates ${t.statementDay ?? "?"}, due ${t.dueDateDay ?? "?"}, limit ${money(t.creditLimit)}, active ${t.isActive})`);

      const entries = await db.monthlyEntry.findMany({
        where: { templateId: t.id },
        select: {
          id: true, amount: true, billedAmount: true, statementAmount: true,
          openingAmount: true, carriedInAmount: true, cashbackAmount: true,
          paidAmount: true, isPaid: true, billPaymentsAttributed: true,
          month: { select: { month: true, year: true, id: true } },
        },
        orderBy: [{ month: { year: "desc" } }, { month: { month: "desc" } }],
        take: 5,
      });

      // All CC charges linked to this card, any month, last ~6 months.
      const since = new Date();
      since.setMonth(since.getMonth() - 6);
      const charges = await db.adHocItem.findMany({
        where: { type: "EXPENSE", ccTemplateId: t.id, date: { gte: since } },
        select: { id: true, name: true, amount: true, date: true, isCredit: true, isCardRepayment: true, monthId: true },
        orderBy: { date: "desc" },
      });
      const monthLabel = new Map(entries.map(e => [e.month.id, `${e.month.month}/${e.month.year}`]));

      for (const e of entries) {
        const ml = `${e.month.month}/${e.month.year}`;
        const preClose = charges.filter(c => c.monthId === e.month.id && t.statementDay != null && new Date(c.date).getDate() < t.statementDay);
        const postClose = charges.filter(c => c.monthId === e.month.id && !(t.statementDay != null && new Date(c.date).getDate() < t.statementDay));
        const sum = (list: typeof charges) => list.reduce((s, c) => s + (c.isCredit ? -c.amount : c.amount), 0);
        console.log(
          `  ${ml.padEnd(8)} amount=${money(e.amount).padStart(10)} billed=${money(e.billedAmount).padStart(10)} stmt=${money(e.statementAmount).padStart(9)} ` +
          `opening=${money(e.openingAmount).padStart(10)} carriedIn=${money(e.carriedInAmount).padStart(9)} cashback=${money(e.cashbackAmount).padStart(7)} ` +
          `billPayAttr=${money(e.billPaymentsAttributed).padStart(8)} paid=${e.isPaid ? "Y" : "n"}`
        );
        console.log(
          `           charges on this monthId: ${charges.filter(c => c.monthId === e.month.id).length}  ` +
          `preClose Σ=${money(sum(preClose))}  postClose Σ=${money(sum(postClose))}`
        );
      }

      // Charges whose monthId is not among the 5 entries printed (attached elsewhere / to a month with no entry row)
      const orphan = charges.filter(c => !monthLabel.has(c.monthId));
      if (orphan.length) {
        console.log(`  charges linked to OTHER months (${orphan.length}, Σ=${money(orphan.reduce((s, c) => s + (c.isCredit ? -c.amount : c.amount), 0))}):`);
        for (const c of orphan.slice(0, 20)) console.log(`     ${d(c.date)}  ${c.name.slice(0, 24).padEnd(24)} ${money(c.isCredit ? -c.amount : c.amount).padStart(10)}  monthId=${c.monthId}`);
      }

      const total6mo = charges.reduce((s, c) => s + (c.isCredit ? -c.amount : c.amount), 0);
      console.log(`  ALL captured charges last 6mo: ${charges.length}  Σ=${money(total6mo)}`);
    }
  }

  await db.$disconnect();
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
