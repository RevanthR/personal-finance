import { db } from "@/lib/db";
import type { Category } from "@/generated/prisma/client";

// Canonicalizes a sub-category name to whatever this user already used
// under the same parent category (case-insensitive), so "Coffee"/"coffee"
// converge — same convergence goal as resolveCustomCategory, but scoped by
// parent and without a dedicated table: sub-categories are a plain string
// column, and suggestions/canonicalization both work by querying existing
// AdHocItem rows for the same parent rather than a normalized relation.
export async function resolveSubCategory(
  userId: string,
  parent: { category: Category | null; customCategoryId: string | null },
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  const existing = await db.adHocItem.findFirst({
    where: {
      month: { userId },
      category: parent.category,
      customCategoryId: parent.customCategoryId,
      subCategory: { equals: trimmed, mode: "insensitive" },
    },
    select: { subCategory: true },
  });
  return existing?.subCategory ?? trimmed;
}
