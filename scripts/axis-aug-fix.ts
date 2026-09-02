/**
 * One-off: bring the Axis August cycle ledger in line with the real
 * statement (Creditcard-test/AXIS_AUg.pdf, Total Payment Due ₹66,942.64).
 *
 *   npx tsx scripts/axis-aug-fix.ts          # dry run
 *   npx tsx scripts/axis-aug-fix.ts --apply
 *
 * Does three things:
 *  1. edits 5 undercaptured charges up to the statement amount (fuel
 *     surcharge the alerts don't show, + one small fee)
 *  2. adds the statement-only lines as ledger rows: 1 missed transaction,
 *     the EMI mechanics, bank fees + GST, and the 3 cashback credits
 *  3. confirms the Axis Sep CardStatement at ₹66,942.64
 *
 * Idempotent: added rows carry notes "axis-aug-recon"; edits are skipped
 * once the amount already matches.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const APPLY = process.argv.includes("--apply");
const MARK = "axis-aug-recon";
const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const utc = (day: number) => new Date(Date.UTC(2026, 7, day, 12, 0, 0));

// name-fragment (as stored in the app) -> real statement amount
const EDITS: { match: string; day: number; to: number }[] = [
  { match: "ANJANI FILI", day: 23, to: 4598.48 },
  { match: "UNIVERSITY", day: 2, to: 4600.26 },
  { match: "FRIENDS FIL", day: 9, to: 4755.26 },
  { match: "Jsk Filling", day: 15, to: 2609.56 },
  { match: "SREE HANUMA", day: 30, to: 1010.00 },
];

const ADDS: { name: string; day: number; amount: number; isCredit?: boolean; cat?: string }[] = [
  { name: "AIRTEL PAYMENTS BANK L", day: 9, amount: 2063.82, cat: "MISCELLANEOUS" },
  { name: "EMI Principal 9/9 (Ref 66638176)", day: 25, amount: 1727.00, cat: "MISCELLANEOUS" },
  { name: "EMI Interest 9/9 (Ref 66638176)", day: 25, amount: 23.00, cat: "MISCELLANEOUS" },
  { name: "GST on EMI interest", day: 25, amount: 4.14, cat: "MISCELLANEOUS" },
  { name: "EMI Processing Fee (Ref 77542551)", day: 10, amount: 299.00, cat: "MISCELLANEOUS" },
  { name: "GST on EMI processing fee", day: 10, amount: 53.82, cat: "MISCELLANEOUS" },
  { name: "Foreign Currency Transaction Fee (PREPORATO)", day: 20, amount: 16.73, cat: "MISCELLANEOUS" },
  { name: "GST on FX fee", day: 20, amount: 3.01, cat: "MISCELLANEOUS" },
  { name: "Amazon Pay India (converted to EMI)", day: 5, amount: 17769.54, cat: "MISCELLANEOUS" },
  { name: "Transaction converted into EMI (reversal)", day: 10, amount: 17769.54, isCredit: true },
  { name: "Cashback credit Aug26", day: 27, amount: 1346.00, isCredit: true },
  { name: "Fuel Cashback Rebates", day: 31, amount: 9.99, isCredit: true },
  { name: "Fuel Cashback Rebates", day: 17, amount: 25.81, isCredit: true },
];

async function main() {
  const u = await db.user.findFirst({ where: { email: { contains: "revanth" } }, select: { id: true } });
  const t = await db.lineItemTemplate.findFirst({
    where: { userId: u!.id, category: "CREDIT_CARD", name: { contains: "Axis", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  const aug = await db.month.findFirst({ where: { userId: u!.id, month: 8, year: 2026 }, select: { id: true } });
  if (!aug) throw new Error("no August month record");
  const card = await db.creditCard.findFirst({ where: { userId: u!.id, templateId: t!.id }, select: { id: true } });

  const existing = await db.adHocItem.findMany({
    where: { ccTemplateId: t!.id, type: "EXPENSE", month: { userId: u!.id }, date: { gte: new Date(Date.UTC(2026, 7, 1)), lt: new Date(Date.UTC(2026, 8, 1)) } },
    select: { id: true, name: true, amount: true, date: true, notes: true },
  });

  console.log(`Axis: ${t!.name}   August monthId ${aug.id}\n`);

  console.log("── EDITS (undercaptured → statement amount) ──");
  for (const e of EDITS) {
    const row = existing.find(r => r.name.toLowerCase().includes(e.match.toLowerCase()) && new Date(r.date).getUTCDate() === e.day);
    if (!row) { console.log(`  ?  ${e.match} (day ${e.day}) not found`); continue; }
    if (Math.abs(row.amount - e.to) < 0.01) { console.log(`  =  ${row.name}  already ${money(e.to)}`); continue; }
    console.log(`  ↑  ${row.name.padEnd(24)}  ${money(row.amount)} -> ${money(e.to)}`);
    if (APPLY) await db.adHocItem.update({ where: { id: row.id }, data: { amount: e.to } });
  }

  console.log("\n── ADDS (statement-only ledger rows) ──");
  for (const a of ADDS) {
    const dup = existing.find(r => r.notes === MARK && r.name === a.name && Math.abs(r.amount - a.amount) < 0.01 && new Date(r.date).getUTCDate() === a.day);
    if (dup) { console.log(`  =  ${a.name}  already added`); continue; }
    console.log(`  +  ${(a.isCredit ? "-" : " ")}${money(a.amount).padStart(12)}  ${a.name}  (Aug ${a.day})`);
    if (APPLY) {
      await db.adHocItem.create({
        data: {
          monthId: aug.id, name: a.name, amount: a.amount, type: "EXPENSE",
          category: a.isCredit ? null : (a.cat as never), ccTemplateId: t!.id,
          isCredit: !!a.isCredit, isCardRepayment: false,
          date: utc(a.day), notes: MARK,
        },
      });
    }
  }

  console.log("\n── CONFIRM Axis Sep statement ──");
  const stmtDate = new Date(Date.UTC(2026, 8, 1));
  if (card) {
    console.log(`  statementBalance -> ${money(66942.64)}   confirmedVia manual`);
    if (APPLY) {
      await db.cardStatement.update({
        where: { cardId_statementDate: { cardId: card.id, statementDate: stmtDate } },
        data: { statementBalance: 66942.64, confirmedAt: new Date(), confirmedVia: "manual" },
      });
    }
  }

  console.log(`\n${APPLY ? "APPLIED" : "DRY RUN — re-run with --apply"}`);
  await db.$disconnect();
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
