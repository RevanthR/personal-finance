/**
 * One-off migration script for Credit Card restructure.
 * Run with: npx tsx scripts/migrate-cc.ts
 *
 * Does three things:
 * 1. Create CreditCard records for every existing CREDIT_CARD template that lacks one.
 * 2. Backfill billedAmount = amount on every CC MonthlyEntry that has no billedAmount yet.
 * 3. Fix the July 2026 Axis CC entry to ₹61,134 (the correct statement balance).
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  // ── 1. Create CreditCard records for existing CC templates ─────────────────
  const ccTemplates = await db.lineItemTemplate.findMany({
    where: { category: "CREDIT_CARD" },
    include: { creditCard: true },
  });

  let created = 0;
  for (const t of ccTemplates) {
    if (!t.creditCard) {
      await db.creditCard.create({
        data: {
          templateId: t.id,
          userId: t.userId,
        },
      });
      created++;
      console.log(`  Created CreditCard for template: ${t.name}`);
    }
  }
  console.log(`✅ Created ${created} CreditCard record(s).`);

  // ── 2. Backfill billedAmount on existing CC MonthlyEntry rows ──────────────
  const templateIds = ccTemplates.map((t) => t.id);
  const ccEntries = await db.monthlyEntry.findMany({
    where: {
      templateId: { in: templateIds },
      billedAmount: null,
    },
    select: { id: true, amount: true, templateId: true },
  });

  let backfilled = 0;
  for (const e of ccEntries) {
    await db.monthlyEntry.update({
      where: { id: e.id },
      data: { billedAmount: e.amount },
    });
    backfilled++;
  }
  console.log(`✅ Backfilled billedAmount on ${backfilled} CC entry/entries.`);

  // ── 3. Fix July 2026 Axis CC entry to ₹61,134 ─────────────────────────────
  const axisTemplate = ccTemplates.find((t) =>
    t.name.toLowerCase().includes("axis")
  );

  if (!axisTemplate) {
    console.log("⚠️  No Axis CC template found — skipping entry fix.");
  } else {
    const julyMonth = await db.month.findFirst({
      where: {
        userId: axisTemplate.userId,
        month: 7,
        year: 2026,
      },
    });

    if (!julyMonth) {
      console.log("⚠️  July 2026 month record not found — skipping entry fix.");
    } else {
      const entry = await db.monthlyEntry.findUnique({
        where: {
          monthId_templateId: {
            monthId: julyMonth.id,
            templateId: axisTemplate.id,
          },
        },
      });

      if (!entry) {
        console.log("⚠️  July 2026 Axis CC entry not found — skipping.");
      } else {
        await db.monthlyEntry.update({
          where: { id: entry.id },
          data: { amount: 61134, billedAmount: 61134 },
        });
        console.log(
          `✅ Fixed July 2026 Axis CC entry: amount=₹61,134, billedAmount=₹61,134 (was amount=₹${entry.amount}).`
        );
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
