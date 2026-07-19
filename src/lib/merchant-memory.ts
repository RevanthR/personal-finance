import { db } from "@/lib/db";
import type { Category } from "@/generated/prisma/client";

export interface MerchantCategoryChoice {
  category: Category | null;
  customCategoryId: string | null;
  subCategory: string | null;
}

// Bank/UPI merchant strings truncate and format inconsistently across email
// types for the same real-world payee ("Toops" vs "TOOPS COFFEE") — this is
// deliberately loose (lowercase, trim, collapse whitespace) rather than an
// exact key, so recall's prefix fallback below has a chance of matching.
export function normalizeMerchantKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

// Remembers the category/sub-category a user picked for a merchant, so the
// next Gmail-sync suggestion for the same payee starts from that instead of
// Gemini's freeform guess. Last correction wins — no scoring, no decay.
export async function rememberMerchantCategory(
  userId: string,
  merchantRaw: string,
  choice: MerchantCategoryChoice,
): Promise<void> {
  const merchantKey = normalizeMerchantKey(merchantRaw);
  if (!merchantKey) return;
  await db.merchantCategoryMemory.upsert({
    where: { userId_merchantKey: { userId, merchantKey } },
    create: { userId, merchantKey, ...choice },
    update: choice,
  });
}

// Batched recall for a list of merchant strings (one query instead of one
// per pending item). Exact match first; falls back to a prefix match in
// either direction (min 4 chars, so short/generic keys don't collide) to
// absorb the truncation noted above.
export async function recallMerchantCategories(
  userId: string,
  merchantRaws: (string | null)[],
): Promise<Map<string, MerchantCategoryChoice>> {
  const keys = [...new Set(merchantRaws.filter((m): m is string => !!m).map(normalizeMerchantKey).filter(Boolean))];
  if (keys.length === 0) return new Map();

  const memories = await db.merchantCategoryMemory.findMany({ where: { userId } });
  if (memories.length === 0) return new Map();

  const result = new Map<string, MerchantCategoryChoice>();
  for (const key of keys) {
    const match = memories.find(m => m.merchantKey === key) ?? memories.find(m => {
      const shorter = m.merchantKey.length < key.length ? m.merchantKey : key;
      return shorter.length >= 4 && (key.startsWith(m.merchantKey) || m.merchantKey.startsWith(key));
    });
    if (match) result.set(key, { category: match.category, customCategoryId: match.customCategoryId, subCategory: match.subCategory });
  }
  return result;
}
