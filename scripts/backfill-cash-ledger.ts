/**
 * One-off backfill for the real-time cash balance (P1).
 *
 *  1. One CashAnchor per user at (first populated month start − 1 day),
 *     balance = 0. Reproduces the old "net since the first month" behaviour,
 *     so nothing jumps until the user reconciles with a real figure.
 *  2. CashPayment rows from history:
 *       - each paid non-CC MonthlyEntry (not paidViaCard), split into its
 *         own-month portion + one row per CarriedDebtSettlement (real dates);
 *       - each CardStatement with a recorded payment.
 *
 * Idempotent: skips a user that already has a CashAnchor, and never creates
 * a second CashPayment for an entry/statement that already has one.
 *
 * Dry-run by default. Pass --apply to write.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { effectivePaid } from "../src/lib/finance-utils";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const APPLY = process.argv.includes("--apply");

const lastDayOf = (year: number, month1: number) =>
  new Date(Date.UTC(year, month1, 0, 12, 0, 0));

async function main() {
  const users = await db.user.findMany({ select: { id: true, email: true } });
  let anchors = 0, entryPayments = 0, cardPayments = 0;

  for (const user of users) {
    const userId = user.id;

    // ── 1. Seed anchor ────────────────────────────────────────────────
    const hasAnchor = await db.cashAnchor.findFirst({ where: { userId } });
    const firstMonth = await db.month.findFirst({
      where: { userId, isPopulated: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
      select: { month: true, year: true },
    });
    if (!hasAnchor && firstMonth) {
      const asOf = new Date(Date.UTC(firstMonth.year, firstMonth.month - 1, 1) - 86_400_000);
      console.log(`${(user.email ?? userId).padEnd(30)} anchor 0 @ ${asOf.toISOString().slice(0, 10)}`);
      if (APPLY) await db.cashAnchor.create({ data: { userId, balance: 0, asOf } });
      anchors++;
    }

    // ── 2. MonthlyEntry payments ──────────────────────────────────────
    const entries = await db.monthlyEntry.findMany({
      where: {
        month: { userId },
        paidViaCardTemplateId: null,
        template: { category: { not: "CREDIT_CARD" } },
        OR: [{ isPaid: true }, { paidAmount: { gt: 0 } }],
      },
      include: {
        month: { select: { month: true, year: true } },
        template: { select: { id: true } },
        cashPayments: { select: { id: true } },
      },
    });
    const allSettlements = await db.carriedDebtSettlement.findMany({
      where: { userId },
      select: { templateId: true, billMonth: true, billYear: true, amount: true, settledOn: true },
    });

    for (const e of entries) {
      if (e.cashPayments.length > 0) continue; // already backfilled
      const total = effectivePaid({ amount: e.amount, cashbackAmount: e.cashbackAmount, isPaid: e.isPaid, paidAmount: e.paidAmount });
      if (total <= 0) continue;

      const carried = allSettlements.filter(s =>
        s.templateId === e.template.id && s.billMonth === e.month.month && s.billYear === e.month.year);
      const carriedTotal = carried.reduce((s, x) => s + x.amount, 0);
      const ownPortion = Math.round((total - carriedTotal) * 100) / 100;

      const rows: { amount: number; paidOn: Date; note: string }[] = [];
      if (ownPortion > 0.5) {
        rows.push({ amount: ownPortion, paidOn: e.paidOn ?? lastDayOf(e.month.year, e.month.month), note: "backfill" });
      }
      for (const s of carried) {
        rows.push({ amount: s.amount, paidOn: s.settledOn, note: "backfill:carried" });
      }
      for (const r of rows) {
        if (APPLY) await db.cashPayment.create({ data: { userId, monthlyEntryId: e.id, amount: r.amount, paidOn: r.paidOn, note: r.note } });
        entryPayments++;
      }
    }

    // ── 3. CardStatement payments ─────────────────────────────────────
    const statements = await db.cardStatement.findMany({
      where: { userId, paidAmount: { gt: 0 } },
      include: { cashPayments: { select: { id: true } } },
    });
    for (const st of statements) {
      if (st.cashPayments.length > 0) continue;
      const paidOn = st.paidAt ?? st.paymentDueDate;
      if (APPLY) await db.cashPayment.create({ data: { userId, cardStatementId: st.id, amount: st.paidAmount, paidOn, note: "backfill" } });
      cardPayments++;
    }
  }

  console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"}: ${anchors} anchors, ${entryPayments} entry payments, ${cardPayments} card payments`);
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
