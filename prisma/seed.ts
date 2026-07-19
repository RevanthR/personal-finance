import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding Artha...");

  // Create admin user (will be linked once you sign in with Google)
  const user = await db.user.upsert({
    where: { email: "revanth.rallabandi@gmail.com" },
    update: { role: "ADMIN" },
    create: {
      email: "revanth.rallabandi@gmail.com",
      name: "Revanth Rallabandi",
      role: "ADMIN",
      isActive: true,
    },
  });
  console.log("✅ User:", user.email);

  // ─── Templates ────────────────────────────────────────────────────────────

  const templates = await Promise.all([
    // House Maintenance
    upsertTemplate(user.id, "Rent", "HOUSE_MAINTENANCE", 21000, true, null, 1),
    upsertTemplate(user.id, "Groceries", "HOUSE_MAINTENANCE", 6000, false, null, 2),
    upsertTemplate(user.id, "Rice", "HOUSE_MAINTENANCE", 3400, false, null, 3),
    upsertTemplate(user.id, "Electricity", "HOUSE_MAINTENANCE", 2000, false, null, 4),
    upsertTemplate(user.id, "Airtel", "HOUSE_MAINTENANCE", 1750, true, null, 5),
    upsertTemplate(user.id, "Fuel", "HOUSE_MAINTENANCE", 10000, false, null, 6),
    upsertTemplate(user.id, "Family Outing", "HOUSE_MAINTENANCE", 8000, false, null, 7),

    // Loans
    upsertTemplate(user.id, "ISB Loan", "LOAN", 44000, true, 5, 10),
    upsertTemplate(user.id, "Personal Loan", "LOAN", 21992, true, 5, 11),

    // Credit Cards (variable, no fixed amount)
    upsertTemplate(user.id, "Axis Bank CC", "CREDIT_CARD", 20000, false, 21, 20),
    upsertTemplate(user.id, "OneCard CC", "CREDIT_CARD", 25000, false, 22, 21),
    upsertTemplate(user.id, "Amazon Pay CC", "CREDIT_CARD", 10000, false, 20, 22),

    // Savings
    upsertTemplate(user.id, "Gold Scheme", "SAVINGS", 3000, true, null, 30),
  ]);

  const [
    rentT, grocT, riceT, elecT, airtelT, fuelT, familyT,
    isbT, persLoanT,
    axisT, onecardT, amazonT,
    goldT,
  ] = templates;

  console.log("✅ Templates created");

  // ─── Chit Funds ───────────────────────────────────────────────────────────

  // Own Chit (₹15,000/month, unlifted, ~20 months from May 2025)
  const ownChitTemplate = await upsertTemplate(user.id, "Chitti (Own)", "CHIT_FUND", 15000, true, null, 40);
  await db.chitFund.upsert({
    where: { templateId: ownChitTemplate.id },
    update: {},
    create: {
      templateId: ownChitTemplate.id,
      userId: user.id,
      totalValue: 300000,
      durationMonths: 20,
      startDate: new Date("2025-05-01"),
      monthlyUnliftedAmount: 15000,
      monthlyLiftedAmount: 18000,
      isLifted: false,
    },
  });

  // Samhith Chit (₹15,000/month, from Sep 2025)
  const samhithChitT = await upsertTemplate(user.id, "Samhith Chit", "CHIT_FUND", 15000, true, null, 41);
  await db.chitFund.upsert({
    where: { templateId: samhithChitT.id },
    update: {},
    create: {
      templateId: samhithChitT.id,
      userId: user.id,
      totalValue: 300000,
      durationMonths: 20,
      startDate: new Date("2025-09-01"),
      monthlyUnliftedAmount: 15000,
      monthlyLiftedAmount: 18000,
      isLifted: false,
    },
  });

  // Jathin Chit (₹6,000/month, from May 2025)
  const jathinChitT = await upsertTemplate(user.id, "Jathin Chit", "CHIT_FUND", 6000, true, null, 42);
  await db.chitFund.upsert({
    where: { templateId: jathinChitT.id },
    update: {},
    create: {
      templateId: jathinChitT.id,
      userId: user.id,
      totalValue: 120000,
      durationMonths: 20,
      startDate: new Date("2025-05-01"),
      monthlyUnliftedAmount: 6000,
      monthlyLiftedAmount: 7500,
      isLifted: false,
    },
  });

  console.log("✅ Chit funds created");

  // ─── Historical Months — FY25-26 ──────────────────────────────────────────

  // FY25-26 monthly data from spreadsheet
  const fy2526 = [
    { month: 4,  year: 2025, salary: 44000,   hm: 45000, cc: 21331, loans: 62807, savings: 3000,  chits: 0 },
    { month: 5,  year: 2025, salary: 163306,  hm: 45000, cc: 32000, loans: 62807, savings: 21500, chits: 12500+6000 },
    { month: 6,  year: 2025, salary: 163306,  hm: 45000, cc: 20502, loans: 44000, savings: 20900, chits: 12500+5400 },
    { month: 7,  year: 2025, salary: 163306,  hm: 45000, cc: 25351, loans: 65992, savings: 20800, chits: 12500+5300 },
    { month: 8,  year: 2025, salary: 163306,  hm: 48000, cc: 30072, loans: 65992, savings: 20750, chits: 12500+5250 },
    { month: 9,  year: 2025, salary: 163306,  hm: 48000, cc: 29000, loans: 65992, savings: 33200, chits: 12500+5200+12500 },
    { month: 10, year: 2025, salary: 163306,  hm: 47500, cc: 29164, loans: 65992, savings: 33150, chits: 12500+5150+12500 },
    { month: 11, year: 2025, salary: 163306,  hm: 47500, cc: 32000, loans: 65992, savings: 35600, chits: 15000+5100+12500 },
    { month: 12, year: 2025, salary: 163306,  hm: 47500, cc: 35000, loans: 65992, savings: 36500, chits: 15000+6000+12500 },
    { month: 1,  year: 2026, salary: 163306,  hm: 47500, cc: 32000, loans: 65992, savings: 36500, chits: 15000+6000+12500 },
    { month: 2,  year: 2026, salary: 158300,  hm: 47500, cc: 32000, loans: 65992, savings: 43500, chits: 15000+6000+15000 },
    { month: 3,  year: 2026, salary: 158300,  hm: 49000, cc: 32000, loans: 65992, savings: 40500, chits: 15000+6000+15000 },
  ];

  // FY26-27 monthly data
  const fy2627 = [
    { month: 4,  year: 2026, salary: 157900,  hm: 49000, cc: 43000, loans: 89878, chits: 36000 },
    { month: 5,  year: 2026, salary: 164000,  hm: 48500, cc: 35057, loans: 89878, chits: 36000 },
    { month: 6,  year: 2026, salary: 164000,  hm: 48500, cc: 32000, loans: 89878, chits: 36000 },
    { month: 7,  year: 2026, salary: 164000,  hm: 48500, cc: 57000, loans: 89878, chits: 36500 },
  ];

  for (const row of fy2526) {
    await seedMonth(user.id, row.month, row.year, row.salary, {
      house: row.hm, cc: row.cc, loans: row.loans, chits: row.chits, savings: row.savings ?? 0,
    }, {
      isbT: isbT.id, persLoanT: persLoanT.id,
      axisT: axisT.id, goldT: goldT.id,
      ownChitT: ownChitTemplate.id, samhithChitT: samhithChitT.id, jathinChitT: jathinChitT.id,
    });
  }

  for (const row of fy2627) {
    await seedMonth(user.id, row.month, row.year, row.salary, {
      house: row.hm, cc: row.cc, loans: row.loans, chits: row.chits, savings: 0,
    }, {
      isbT: isbT.id, persLoanT: persLoanT.id,
      axisT: axisT.id, goldT: goldT.id,
      ownChitT: ownChitTemplate.id, samhithChitT: samhithChitT.id, jathinChitT: jathinChitT.id,
    });
  }

  console.log("✅ Historical months seeded");
  console.log("🎉 Done! Sign in at http://localhost:3000/login");
}

async function upsertTemplate(
  userId: string, name: string, category: string, amount: number,
  isFixed: boolean, dueDateDay: number | null, sortOrder: number
) {
  return db.lineItemTemplate.upsert({
    where: {
      // Use a synthetic unique key via findFirst + create pattern
      id: (await db.lineItemTemplate.findFirst({ where: { userId, name } }))?.id ?? "new",
    },
    update: { amount, isFixed, dueDateDay, sortOrder },
    create: {
      userId, name, category: category as Parameters<typeof db.lineItemTemplate.create>[0]["data"]["category"],
      amount, isFixed, dueDateDay, sortOrder, isActive: true,
    },
  });
}

async function seedMonth(
  userId: string, month: number, year: number, salary: number,
  totals: { house: number; cc: number; loans: number; chits: number; savings: number },
  templateIds: { isbT: string; persLoanT: string; axisT: string; goldT: string; ownChitT: string; samhithChitT: string; jathinChitT: string }
) {
  const existingMonth = await db.month.findUnique({
    where: { userId_month_year: { userId, month, year } },
  });
  if (existingMonth) return; // don't overwrite

  const m = await db.month.create({
    data: { userId, month, year, salaryIncome: salary, isPopulated: true },
  });

  // ISB Loan
  await db.monthlyEntry.create({ data: { monthId: m.id, templateId: templateIds.isbT, amount: 44000, isPaid: true, paidOn: new Date(year, month - 1, 5) } });
  // Personal Loan
  if (totals.loans > 44000) {
    await db.monthlyEntry.create({ data: { monthId: m.id, templateId: templateIds.persLoanT, amount: totals.loans - 44000, isPaid: true, paidOn: new Date(year, month - 1, 5) } });
  }
  // Credit Card (rolled up into Axis CC entry)
  await db.monthlyEntry.create({ data: { monthId: m.id, templateId: templateIds.axisT, amount: totals.cc, isPaid: true, paidOn: new Date(year, month - 1, 21) } });
  // Gold Scheme
  if (totals.savings >= 3000) {
    await db.monthlyEntry.create({ data: { monthId: m.id, templateId: templateIds.goldT, amount: 3000, isPaid: true, paidOn: new Date(year, month - 1, 10) } });
  }
  // Chits
  if (totals.chits > 0) {
    const chitPer = Math.round(totals.chits / 3);
    await db.monthlyEntry.create({ data: { monthId: m.id, templateId: templateIds.ownChitT, amount: chitPer, isPaid: true, paidOn: new Date(year, month - 1, 15) } });
    await db.monthlyEntry.create({ data: { monthId: m.id, templateId: templateIds.samhithChitT, amount: chitPer, isPaid: true, paidOn: new Date(year, month - 1, 15) } });
    await db.monthlyEntry.create({ data: { monthId: m.id, templateId: templateIds.jathinChitT, amount: totals.chits - chitPer * 2, isPaid: true, paidOn: new Date(year, month - 1, 15) } });
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
