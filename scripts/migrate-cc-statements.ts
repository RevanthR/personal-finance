/**
 * Build CardStatement rows from the existing MonthlyEntry / AdHocItem history.
 *
 *   npx tsx scripts/migrate-cc-statements.ts                       # dry run
 *   npx tsx scripts/migrate-cc-statements.ts --apply
 *   npx tsx scripts/migrate-cc-statements.ts --email revanth --card "Axis"
 *
 * One row per card per closed billing cycle. For each cycle:
 *   - statementBalance + confirmedAt: taken as CONFIRMED when the old
 *     MonthlyEntry.billedAmount was deliberately set (differs from the
 *     charge-sum estimate), OR the cycle is closed and paid (nothing in a
 *     settled past cycle should ever move). Otherwise left null (estimated).
 *   - paidAmount / paidInFull / cashback: carried from the old MonthlyEntry.
 * The open cycle gets no row (it is just unbilled spend).
 *
 * Idempotent: re-running upserts on (cardId, statementDate).
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  statementDateFor, currentCycleOpen, prevStatementDate, dueDateFor,
} from "../src/lib/cards";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const arg = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const EMAIL = arg("--email");
const CARD = arg("--card");
const EPS = 1;
const money = (n: number | null | undefined) => (n == null ? "-" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const day = (d: Date) => d.toISOString().slice(0, 10);

type Charge = { date: Date; amount: number; isCredit: boolean };
const signed = (c: Charge) => (c.isCredit ? -c.amount : c.amount);
function sumWindow(charges: Charge[], start: Date, end: Date): number {
  return Math.round(charges.filter(c => c.date >= start && c.date < end).reduce((s, c) => s + signed(c), 0) * 100) / 100;
}

async function main() {
  const users = await db.user.findMany({
    where: EMAIL ? { email: { contains: EMAIL, mode: "insensitive" } } : undefined,
    select: { id: true, email: true },
  });

  let planned = 0, confirmedCount = 0, estimatedCount = 0;

  for (const u of users) {
    const cards = await db.creditCard.findMany({
      where: { userId: u.id, ...(CARD ? { template: { name: { contains: CARD, mode: "insensitive" } } } : {}) },
      select: { id: true, template: { select: { id: true, name: true, statementDay: true, dueDateDay: true } } },
    });
    if (cards.length === 0) continue;

    for (const c of cards) {
      const t = c.template;
      if (t.statementDay == null) { console.log(`SKIP ${u.email} · ${t.name}: no statement day`); continue; }
      const sd = t.statementDay;
      const dd = t.dueDateDay ?? sd;

      const rawCharges = await db.adHocItem.findMany({
        where: { ccTemplateId: t.id, type: "EXPENSE", month: { userId: u.id } },
        select: { date: true, amount: true, isCredit: true },
      });
      const charges: Charge[] = rawCharges.map(r => ({ date: new Date(r.date), amount: r.amount, isCredit: r.isCredit }));

      const entries = await db.monthlyEntry.findMany({
        where: { templateId: t.id, month: { userId: u.id } },
        select: {
          amount: true, billedAmount: true, statementAmount: true, isPaid: true,
          paidOn: true, paidAmount: true, cashbackAmount: true, createdAt: true,
          month: { select: { month: true, year: true } },
        },
      });
      const entryByYm = new Map(entries.map(e => [`${e.month.year}-${e.month.month}`, e]));

      if (charges.length === 0 && entries.length === 0) continue;

      // Closed cycles: from the earliest charge's cycle up to (not including)
      // the currently-open one.
      const now = new Date();
      const openCycle = currentCycleOpen(sd, now);
      const earliest = charges.length
        ? charges.reduce((m, x) => (x.date < m ? x.date : m), charges[0].date)
        : new Date(Math.min(...entries.map(e => new Date(Date.UTC(e.month.year, e.month.month - 1, 1)).getTime())));

      // Walk statement dates forward.
      let stDate = statementDateFor(earliest.getUTCFullYear(), earliest.getUTCMonth(), sd);
      if (stDate <= earliest) stDate = statementDateFor(stDate.getUTCFullYear(), stDate.getUTCMonth() + 1, sd);

      console.log(`\n### ${u.email} · ${t.name}  (cuts ${sd}, due ${dd})`);

      while (stDate.getTime() <= openCycle.getTime()) {
        const cycleStart = prevStatementDate(sd, stDate);
        const due = dueDateFor(stDate, sd, dd);
        const estimate = Math.max(0, sumWindow(charges, cycleStart, stDate));

        // The old MonthlyEntry for the calendar month this statement closes in.
        const ym = `${stDate.getUTCFullYear()}-${stDate.getUTCMonth() + 1}`;
        const e = entryByYm.get(ym);
        const oldBill = e ? (e.billedAmount ?? e.amount) : null;

        let statementBalance: number | null = null;
        let confirmedAt: Date | null = null;
        let confirmedVia: string | null = null;

        if (e && oldBill != null && Math.abs(oldBill - estimate) > EPS) {
          statementBalance = oldBill;
          confirmedAt = e.createdAt;
          confirmedVia = "manual";
        } else if (e && e.isPaid) {
          statementBalance = oldBill ?? estimate;
          confirmedAt = e.paidOn ?? e.createdAt;
          confirmedVia = "migration";
        }

        const paidInFull = !!e?.isPaid;
        const paidAmount = paidInFull
          ? (statementBalance ?? oldBill ?? estimate)
          : (e?.paidAmount ?? 0);
        // Best available proxy for when it was paid: the recorded paidOn,
        // else the payment due date for that cycle.
        const paidAt = paidInFull ? (e?.paidOn ?? due) : (e?.paidAmount ? due : null);
        const cashback = e?.cashbackAmount ?? 0;

        const label = confirmedVia === "manual" ? "confirmed(set)" : confirmedVia === "migration" ? "confirmed(paid)" : "estimated";
        if (confirmedVia) confirmedCount++; else estimatedCount++;
        planned++;
        console.log(
          `  ${day(stDate)}  ${label.padEnd(15)} balance=${money(statementBalance).padStart(11)}  ` +
          `estimate=${money(estimate).padStart(11)}  paid=${money(paidAmount).padStart(10)}${paidInFull ? " (full)" : ""}  cashback=${money(cashback)}`
        );

        if (APPLY) {
          await db.cardStatement.upsert({
            where: { cardId_statementDate: { cardId: c.id, statementDate: stDate } },
            create: {
              cardId: c.id, userId: u.id, cycleStart, statementDate: stDate, paymentDueDate: due,
              statementBalance, confirmedAt, confirmedVia, paidAmount, paidInFull, paidAt, cashback,
            },
            update: { cycleStart, paymentDueDate: due, statementBalance, confirmedAt, confirmedVia, paidAmount, paidInFull, paidAt, cashback },
          });
        }

        stDate = statementDateFor(stDate.getUTCFullYear(), stDate.getUTCMonth() + 1, sd);
      }
    }
  }

  console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"}, ${planned} statement rows (${confirmedCount} confirmed, ${estimatedCount} estimated).`);
  if (!APPLY && planned > 0) console.log("Re-run with --apply to write.");
  await db.$disconnect();
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
