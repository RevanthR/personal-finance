import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const db = new PrismaClient({ adapter });

  const users = await db.user.findMany({ select: { id: true } });
  let categoriesCreated = 0, templatesLinked = 0, itemsLinked = 0, ccLinked = 0, ccUnresolved = 0;

  for (const { id: userId } of users) {
    const templates = await db.lineItemTemplate.findMany({
      where: { userId, customCategory: { not: null } },
      select: { id: true, customCategory: true },
    });
    const items = await db.adHocItem.findMany({
      where: { month: { userId }, customCategory: { not: null } },
      select: { id: true, customCategory: true },
    });

    // Case-insensitive, trimmed dedup — first-seen casing wins as canonical.
    const canonicalByLower = new Map<string, string>(); // lower -> canonical display name
    for (const row of [...templates, ...items]) {
      const raw = row.customCategory!.trim();
      const lower = raw.toLowerCase();
      if (!canonicalByLower.has(lower)) canonicalByLower.set(lower, raw);
    }
    if (canonicalByLower.size === 0) continue;

    const nameToId = new Map<string, string>();
    for (const canonicalName of canonicalByLower.values()) {
      const row = await db.customCategory.upsert({
        where: { userId_name: { userId, name: canonicalName } },
        create: { userId, name: canonicalName },
        update: {},
      });
      nameToId.set(canonicalName, row.id);
      categoriesCreated++;
    }

    for (const t of templates) {
      const canonical = canonicalByLower.get(t.customCategory!.trim().toLowerCase())!;
      await db.lineItemTemplate.update({
        where: { id: t.id },
        data: { customCategory: canonical, customCategoryId: nameToId.get(canonical) },
      });
      templatesLinked++;
    }
    for (const a of items) {
      const canonical = canonicalByLower.get(a.customCategory!.trim().toLowerCase())!;
      await db.adHocItem.update({
        where: { id: a.id },
        data: { customCategory: canonical, customCategoryId: nameToId.get(canonical) },
      });
      itemsLinked++;
    }

    // ccTemplateId backfill — parse the existing "CardName · ..." notes prefix once.
    const ccItems = await db.adHocItem.findMany({
      where: { month: { userId }, category: "CREDIT_CARD", type: "EXPENSE", ccTemplateId: null },
      select: { id: true, notes: true },
    });
    if (ccItems.length > 0) {
      const ccTemplates = await db.lineItemTemplate.findMany({
        where: { userId, category: "CREDIT_CARD" },
        select: { id: true, name: true },
      });
      for (const item of ccItems) {
        const cardName = item.notes?.split(" · ")[0]?.trim();
        const match = cardName ? ccTemplates.find(t => t.name === cardName) : undefined;
        if (match) {
          await db.adHocItem.update({ where: { id: item.id }, data: { ccTemplateId: match.id } });
          ccLinked++;
        } else {
          ccUnresolved++;
        }
      }
    }
  }

  console.log(JSON.stringify({ users: users.length, categoriesCreated, templatesLinked, itemsLinked, ccLinked, ccUnresolved }, null, 2));
  await db.$disconnect();
}
main();
