/**
 * One-off transition fix. Months set up before the credit-card model
 * switch had their opening balance computed the old way, which counted a
 * card bill as cash-out in the month its MonthlyEntry was marked paid. The
 * new dashboard also subtracts card-statement payments by paidAt. So a card
 * bill that closed in an earlier month but is paid in (or after) the
 * current month gets subtracted twice: once baked into the frozen opening
 * balance, once live on the dashboard.
 *
 * This adds that amount back to the affected month's opening balance, once.
 * Only touches a user's current + future populated months (the only ones
 * that read the new cardStatus() cash figure). Idempotent per the marker
 * note it writes.
 *
 * Dry-run by default. Pass --apply to write.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const APPLY = process.argv.includes("--apply");

async function main() {
  const now = new Date();
  const curMonth = now.getUTCMonth() + 1;
  const curYear = now.getUTCFullYear();
  const curStart = new Date(Date.UTC(curYear, curMonth - 1, 1));

  const users = await db.user.findMany({ select: { id: true, email: true } });
  for (const user of users) {
    const month = await db.month.findFirst({
      where: { userId: user.id, month: curMonth, year: curYear, isPopulated: true },
      select: { id: true, openingBalance: true },
    });
    if (!month) continue;

    // Card statements that closed before this month but are paid in this
    // month or later — double-counted (frozen opening + live dashboard).
    const stmts = await db.cardStatement.findMany({
      where: {
        userId: user.id,
        statementDate: { lt: curStart },
        paidAt: { gte: curStart },
      },
      select: { paidAmount: true, statementDate: true, paidAt: true, card: { select: { template: { select: { name: true } } } } },
    });
    const adjust = Math.round(stmts.reduce((s, r) => s + r.paidAmount, 0));
    if (adjust === 0) continue;

    const next = month.openingBalance + adjust;
    console.log(`${(user.email ?? user.id).padEnd(30)}  opening ${Math.round(month.openingBalance)} + ${adjust} -> ${Math.round(next)}`);
    for (const s of stmts) {
      console.log(`    ${s.card.template.name.padEnd(16)} closed ${s.statementDate.toISOString().slice(0, 10)}  paid ${s.paidAt?.toISOString().slice(0, 10)}  ${Math.round(s.paidAmount)}`);
    }
    if (APPLY) {
      await db.month.update({ where: { id: month.id }, data: { openingBalance: next } });
    }
  }

  console.log(APPLY ? "\nAPPLIED." : "\nDry run. Pass --apply to write.");
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
