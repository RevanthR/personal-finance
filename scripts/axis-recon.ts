/** One-off line-by-line reconciliation: Axis Sep statement vs app-captured charges. Read-only. */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// Transcribed from Creditcard-test/AXIS_AUg.pdf. d = day of August, +amount debit, -amount credit.
type S = { d: number; name: string; amt: number; credit?: boolean; kind?: "fee" | "emi" | "gst" | "cashback" | "payment" };
const STMT: S[] = [
  { d: 31, name: "TOOPS COFFEE", amt: 280 },
  { d: 31, name: "TOOPS COFFEE", amt: 350 },
  { d: 31, name: "Fuel Cashback Rebates", amt: 9.99, credit: true, kind: "cashback" },
  { d: 30, name: "SREE HANUMAN ENTERPRI", amt: 1010 },
  { d: 29, name: "Udemy India LLP", amt: 565.22 },
  { d: 27, name: "Cashback credit Aug26", amt: 1346, credit: true, kind: "cashback" },
  { d: 26, name: "Swiggy Instamart", amt: 350 },
  { d: 25, name: "GOOGLECLOUD", amt: 1000 },
  { d: 25, name: "CHILAKA COFFEE", amt: 885 },
  { d: 25, name: "SWIGGY E COM", amt: 961 },
  { d: 25, name: "EMI Interest - 9/9 Ref#66638176", amt: 23, kind: "emi" },
  { d: 25, name: "EMI Principal - 9/9 Ref#66638176", amt: 1727, kind: "emi" },
  { d: 25, name: "GST (on EMI interest)", amt: 4.14, kind: "gst" },
  { d: 24, name: "TOOPS COFFEE", amt: 350 },
  { d: 24, name: "MOHAMMED ABDUL KHADER", amt: 800 },
  { d: 24, name: "TOOPS COFFEE", amt: 660 },
  { d: 24, name: "Eat Good Technologies", amt: 95 },
  { d: 23, name: "SANTE FOODS", amt: 494 },
  { d: 23, name: "ANJANI FILING STATION", amt: 4598.48 },
  { d: 23, name: "THE CHEF FRIENDS", amt: 265 },
  { d: 22, name: "PRASAD S", amt: 850 },
  { d: 22, name: "Swiggy Food", amt: 239 },
  { d: 21, name: "TOOPS COFFEE", amt: 350 },
  { d: 21, name: "SWIGGY E COM", amt: 893 },
  { d: 21, name: "TOOPS COFFEE", amt: 310 },
  { d: 21, name: "Razorpay Payments", amt: 1421, credit: true, kind: "cashback" },
  { d: 21, name: "HUNGERBOX", amt: 82 },
  { d: 20, name: "TOOPS COFFEE", amt: 350 },
  { d: 20, name: "SWIGGY E COM", amt: 1026 },
  { d: 20, name: "TOOPS COFFEE", amt: 650 },
  { d: 20, name: "CHILAKA COFFEE", amt: 1134 },
  { d: 20, name: "PREPORATO,WROCLAW", amt: 477.90 },
  { d: 20, name: "Foreign Currency Transaction Fee", amt: 16.73, kind: "fee" },
  { d: 20, name: "GST (on FX fee)", amt: 3.01, kind: "gst" },
  { d: 18, name: "TOOPS COFFEE", amt: 350 },
  { d: 18, name: "Eat Good Technologies", amt: 204 },
  { d: 18, name: "SWIGGY INSTAMART PRIVA", amt: 355 },
  { d: 17, name: "Fuel Cashback Rebates", amt: 25.81, credit: true, kind: "cashback" },
  { d: 16, name: "Swiggy Food", amt: 1602 },
  { d: 15, name: "Jsk Filling Station", amt: 2609.56 },
  { d: 15, name: "RATNADEEP RETAIL PRIV", amt: 269.06 },
  { d: 15, name: "Ms Rangeela Family Dha", amt: 1530 },
  { d: 15, name: "Ms Rangeela Family Dha", amt: 1530 },
  { d: 13, name: "TOOPS COFFEE", amt: 350 },
  { d: 13, name: "HUNGERBOX", amt: 156 },
  { d: 12, name: "BUNDL TECHNOLOGIES", amt: 590 },
  { d: 12, name: "MYST", amt: 3400 },
  { d: 11, name: "TOOPS COFFEE", amt: 350 },
  { d: 11, name: "TOOPS COFFEE", amt: 310 },
  { d: 11, name: "HUNGERBOX", amt: 143 },
  { d: 10, name: "TOOPS COFFEE", amt: 280 },
  { d: 10, name: "TOOPS COFFEE", amt: 300 },
  { d: 10, name: "EMI Processing Fee Ref#77542551", amt: 299, kind: "fee" },
  { d: 10, name: "Transaction conversion into EMI", amt: 17769.54, credit: true, kind: "emi" },
  { d: 10, name: "GST (on EMI processing fee)", amt: 53.82, kind: "gst" },
  { d: 9, name: "RATNADEEP RETAIL PRIV", amt: 779.61 },
  { d: 9, name: "AIRTEL PAYMENTS BANK L", amt: 2063.82 },
  { d: 9, name: "FRIENDS FILLING STATI", amt: 4755.26 },
  { d: 9, name: "Explorex", amt: 1175 },
  { d: 8, name: "PAY*BOOKMYSHOW COM", amt: 283.04 },
  { d: 8, name: "SREE VAISHNAVI PHARMA", amt: 1482 },
  { d: 8, name: "ABC CHARCOAL SHAWARMA", amt: 169 },
  { d: 8, name: "ASTRALIS COFFEE WORKS", amt: 850 },
  { d: 7, name: "Beyoung Folks Priva", amt: 2488 },
  { d: 7, name: "ZEPTO MARKETPLACE PRI", amt: 356 },
  { d: 6, name: "BBPS Payment Received (prev bill)", amt: 83249.71, credit: true, kind: "payment" },
  { d: 5, name: "AMAZON PAY INDIA PRIVA", amt: 17769.54, kind: "emi" },
  { d: 5, name: "ZEPTO MARKETPLACE PRI", amt: 199 },
  { d: 5, name: "METRO CASH AND CARRY", amt: 2724.32 },
  { d: 5, name: "PYU*Zepto Marketplace", amt: 309 },
  { d: 5, name: "ZEPTO MARKETPLACE PRI", amt: 165 },
  { d: 5, name: "Swiggy", amt: 603 },
  { d: 4, name: "TOOPS COFFEE", amt: 350 },
  { d: 3, name: "TOOPS COFFEE", amt: 310 },
  { d: 3, name: "CINEPOLIS TNR", amt: 1040 },
  { d: 3, name: "AIRTEL PAYMENTS BANK L", amt: 2262.57 },
  { d: 3, name: "PAY*BOOKMYSHOW COM", amt: 849.12 },
  { d: 3, name: "ZEPTO MARKETPLACE PRI", amt: 415 },
  { d: 3, name: "TOOPS COFFEE", amt: 350 },
  { d: 2, name: "UNIVERSITY FILLING ST", amt: 4600.26 },
  { d: 2, name: "SRI GANESH LIQUOR MAR", amt: 2780 },
  { d: 2, name: "CINEPOLIS TNR", amt: 550 },
  { d: 2, name: "BUNDL TECHNOLOGIES", amt: 580 },
  { d: 1, name: "BOOK MY SHOW SMART G", amt: 675.52 },
  { d: 1, name: "SIDS FARM pvt ltd", amt: 1100 },
];

async function main() {
  const u = await db.user.findFirst({ where: { email: { contains: "revanth" } }, select: { id: true } });
  const t = await db.lineItemTemplate.findFirst({
    where: { userId: u!.id, category: "CREDIT_CARD", name: { contains: "Axis", mode: "insensitive" } },
    select: { id: true },
  });
  const from = new Date(Date.UTC(2026, 7, 1)), to = new Date(Date.UTC(2026, 8, 1));
  const rows = await db.adHocItem.findMany({
    where: { ccTemplateId: t!.id, type: "EXPENSE", date: { gte: from, lt: to }, month: { userId: u!.id } },
    select: { name: true, amount: true, date: true, isCredit: true },
    orderBy: { date: "asc" },
  });
  const app = rows.map(r => ({ d: new Date(r.date).getUTCDate(), name: r.name, amt: r.amount, credit: r.isCredit, used: false }));

  const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  console.log("STMT DAY | STATEMENT LINE                        | AMOUNT      | APP MATCH                       | APP AMT     | NOTE");
  console.log("-".repeat(140));

  let stmtDebit = 0, stmtCredit = 0, appMatchedDebit = 0, appMatchedCredit = 0;
  const untrackedDebits: S[] = [], untrackedCredits: S[] = [];

  for (const s of STMT) {
    if (s.credit) stmtCredit += s.amt; else stmtDebit += s.amt;
    // find best app match: same credit-ness, |amount diff| smallest, within a window
    let best: (typeof app)[number] | null = null;
    let bestDiff = Infinity;
    for (const a of app) {
      if (a.used || !!a.credit !== !!s.credit) continue;
      const diff = Math.abs(a.amt - s.amt);
      const dayGap = Math.abs(a.d - s.d);
      if (diff <= Math.max(60, s.amt * 0.02) && dayGap <= 3 && diff < bestDiff) { best = a; bestDiff = diff; }
    }
    let note = "";
    if (best) {
      best.used = true;
      if (s.credit) appMatchedCredit += best.amt; else appMatchedDebit += best.amt;
      const d = Math.round((s.amt - best.amt) * 100) / 100;
      note = d === 0 ? "exact" : `app ${d > 0 ? "under" : "over"} by ${money(Math.abs(d))}${Math.abs(d) > 5 ? "  <- surcharge/fee" : "  (rounding)"}`;
    } else {
      if (s.credit) untrackedCredits.push(s); else untrackedDebits.push(s);
      note = s.kind === "cashback" ? "NOT TRACKED (cashback credit, statement-only)"
        : s.kind === "emi" ? "NOT TRACKED (EMI mechanics)"
        : s.kind === "fee" ? "NOT TRACKED (bank fee, statement-only)"
        : s.kind === "gst" ? "NOT TRACKED (GST on a fee, statement-only)"
        : s.kind === "payment" ? "prev bill payment (nets vs opening balance)"
        : "NOT TRACKED (missed capture)";
    }
    console.log(
      `${String(s.d).padStart(3)}     | ${s.name.slice(0, 37).padEnd(37)} | ${(s.credit ? "-" : "+") + money(s.amt).padStart(10)} | ${(best ? best.name.slice(0, 30) : "").padEnd(30)} | ${(best ? money(best.amt).padStart(10) : "").padEnd(11)} | ${note}`
    );
  }

  console.log("\n" + "=".repeat(140));
  console.log("APP TRANSACTIONS WITH NO STATEMENT MATCH (extra / duplicate / wrong):");
  for (const a of app.filter(x => !x.used)) {
    console.log(`  day ${String(a.d).padStart(2)}  ${(a.credit ? "-" : "+")}${money(a.amt).padStart(10)}  ${a.name}`);
  }

  console.log("\n" + "=".repeat(140));
  console.log("TOTALS");
  console.log(`  Statement debits          ${money(stmtDebit).padStart(14)}`);
  console.log(`  Statement credits         ${money(stmtCredit).padStart(14)}   (incl. ${money(83249.71)} prev-bill payment)`);
  console.log(`  Statement total due       ${money(stmtDebit - stmtCredit).padStart(14)}`);
  console.log(`  App debits (all)          ${money(app.filter(a => !a.credit).reduce((s, a) => s + a.amt, 0)).padStart(14)}`);
  console.log(`  App credits (all)         ${money(app.filter(a => a.credit).reduce((s, a) => s + a.amt, 0)).padStart(14)}`);
  console.log(`  App net                   ${money(app.reduce((s, a) => s + (a.credit ? -a.amt : a.amt), 0)).padStart(14)}`);
  const untD = untrackedDebits.filter(s => s.kind !== "payment").reduce((s, x) => s + x.amt, 0);
  const untC = untrackedCredits.filter(s => s.kind !== "payment").reduce((s, x) => s + x.amt, 0);
  console.log(`\n  Untracked statement debits ${money(untD).padStart(13)}  (fees/EMI/GST/missed)`);
  console.log(`  Untracked statement credits${money(untC).padStart(13)}  (cashbacks + EMI conversion wash)`);
  await db.$disconnect();
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
