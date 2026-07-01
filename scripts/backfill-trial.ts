import { db } from "../src/lib/db";

async function main() {
  const trialEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const result = await db.user.updateMany({
    where: { trialEndsAt: null },
    data: { trialEndsAt },
  });
  console.log(`Backfilled ${result.count} users with trialEndsAt = ${trialEndsAt.toISOString()}`);
}

main().catch(console.error).finally(() => db.$disconnect());
