import { db } from "@/lib/db";

// Look up (or create) the canonical row for a custom category name, so the
// same category never ends up stored under two slightly different strings
// (case/whitespace variants) across templates and ad-hoc items.
export async function resolveCustomCategory(userId: string, name: string): Promise<{ id: string; name: string }> {
  const trimmed = name.trim();
  const existing = await db.customCategory.findFirst({
    where: { userId, name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  return db.customCategory.create({ data: { userId, name: trimmed } });
}
