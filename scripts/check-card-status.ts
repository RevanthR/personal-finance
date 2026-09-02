/** Temporary: run cardStatus() against real data to sanity-check the rework. Read-only. */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { cardStatus } from "../src/lib/cards";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const m = (n: number | null) => (n == null ? "-" : `₹${Math.round(n).toLocaleString("en-IN")}`);

async function main() {
  const arg = process.argv[2] ?? "revanth";
  const u = await db.user.findFirst({ where: { email: { contains: arg, mode: "insensitive" } }, select: { id: true } });
  if (!u) return console.log("no user");

  const cards = await db.creditCard.findMany({
    where: { userId: u.id },
    include: {
      template: { select: { name: true, statementDay: true, dueDateDay: true, creditLimit: true } },
      statements: true,
    },
  });
  const since = new Date(); since.setMonth(since.getMonth() - 14);
  const charges = await db.adHocItem.findMany({
    where: { type: "EXPENSE", ccTemplateId: { in: cards.map(c => c.templateId) }, date: { gte: since }, month: { userId: u.id } },
    select: { ccTemplateId: true, date: true, amount: true, isCredit: true },
  });

  for (const c of cards) {
    const ch = charges.filter(x => x.ccTemplateId === c.templateId).map(x => ({ date: x.date, amount: x.amount, isCredit: x.isCredit }));
    const st = cardStatus(
      { statementDay: c.template.statementDay, dueDateDay: c.template.dueDateDay, creditLimit: c.template.creditLimit },
      c.statements.map(s => ({
        statementDate: s.statementDate, paymentDueDate: s.paymentDueDate, statementBalance: s.statementBalance,
        confirmedAt: s.confirmedAt, paidAmount: s.paidAmount, paidInFull: s.paidInFull, cashback: s.cashback,
      })),
      ch,
    );
    console.log(
      `${c.template.name.padEnd(16)} ${st.status.padEnd(12)} ` +
      `owed=${m(st.statementBalance).padStart(10)}  unbilled=${m(st.unbilledSpends).padStart(10)}  ` +
      `pastDue=${m(st.pastDue).padStart(8)}  current=${m(st.currentBalance).padStart(11)}  ` +
      `util=${st.utilisation != null ? Math.round(st.utilisation * 100) + "%" : "-"}  due=${st.paymentDueDate ? st.paymentDueDate.toISOString().slice(0, 10) : "-"}`
    );
  }
  await db.$disconnect();
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
