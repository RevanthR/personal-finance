import { db } from "../src/lib/db";

async function main() {
const users = await db.user.findMany({
  select: { name: true, email: true, planType: true, planExpiry: true, trialEndsAt: true, isActive: true, createdAt: true },
  orderBy: { createdAt: "asc" },
});

const now = new Date();
for (const u of users) {
  const hasPlan  = u.planExpiry && new Date(u.planExpiry) > now;
  const hasTrial = u.trialEndsAt && new Date(u.trialEndsAt) > now;
  const status   = hasPlan ? "PAID" : hasTrial ? "TRIAL" : "EXPIRED";
  const trialEnd = u.trialEndsAt ? new Date(u.trialEndsAt).toDateString() : "none";
  const planEnd  = u.planExpiry  ? new Date(u.planExpiry).toDateString()  : "none";
  console.log(`${u.name} | ${u.email} | ${status} | trial: ${trialEnd} | plan: ${planEnd} | active: ${u.isActive}`);
}

await db.$disconnect();
}
main().catch(console.error);
