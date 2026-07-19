import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ImportsClient } from "@/components/imports/imports-client";
import { findExistingMatches, findParsedTransactionDuplicates } from "@/lib/gmail/dedupe";
import { findEntryMatches } from "@/lib/gmail/entry-match";
import { recallMerchantCategories, normalizeMerchantKey } from "@/lib/merchant-memory";

export default async function ImportsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [gmailConnection, ccTemplates, customCategories, subCategorySuggestions, pending] = await Promise.all([
    db.gmailConnection.findUnique({ where: { userId } }),
    db.lineItemTemplate.findMany({
      where: { userId, category: "CREDIT_CARD", isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.customCategory.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.adHocItem.findMany({
      where: { month: { userId }, subCategory: { not: null } },
      select: { category: true, customCategoryId: true, subCategory: true },
      distinct: ["category", "customCategoryId", "subCategory"],
      orderBy: { date: "desc" },
    }),
    db.parsedTransaction.findMany({
      where: { userId, status: "PENDING" },
      orderBy: { date: "desc" },
    }),
  ]);

  const matches = await findExistingMatches(
    userId,
    pending.map(p => ({ id: p.id, date: p.date, amount: p.amount, merchant: p.merchant })),
  );
  const dupes = findParsedTransactionDuplicates(
    pending.map(p => ({ id: p.id, date: p.date, amount: p.amount, last4: p.last4, merchant: p.merchant, bank: p.bank, createdAt: p.createdAt })),
  );
  const entryMatches = await findEntryMatches(
    userId,
    pending.map(p => ({ id: p.id, date: p.date, amount: p.amount, merchant: p.merchant, bank: p.bank, paymentMethod: p.paymentMethod })),
  );

  // Learned category per merchant, from past corrections in this same
  // review flow (see src/lib/merchant-memory.ts) — resolved to a name here
  // since the client picker matches custom categories by name, not id.
  const customCategoryNameById = new Map(customCategories.map(c => [c.id, c.name]));
  const merchantMemory = await recallMerchantCategories(userId, pending.map(p => p.merchant ?? p.bank));

  const gmail = {
    connected: !!gmailConnection,
    connectedEmail: gmailConnection?.email ?? null,
    lastSyncAt: gmailConnection?.lastSyncAt?.toISOString() ?? null,
    ccCards: ccTemplates.map(t => ({ templateId: t.id, name: t.name })),
    customCategories,
    subCategorySuggestions,
    pending: pending.map(p => ({
      id: p.id,
      bank: p.bank,
      amount: p.amount,
      originalCurrency: p.originalCurrency,
      originalAmount: p.originalAmount,
      merchant: p.merchant,
      last4: p.last4,
      date: p.date.toISOString(),
      transactionTime: p.transactionTime,
      emailReceivedAt: p.emailReceivedAt?.toISOString() ?? null,
      rawSnippet: p.rawSnippet,
      paymentMethod: p.paymentMethod,
      transactionType: p.transactionType,
      suggestedCcTemplateId: p.suggestedCcTemplateId,
      suggestedSubcategory: p.suggestedSubcategory,
      possibleMatch: matches.get(p.id) ?? dupes.get(p.id) ?? null,
      matchedEntry: entryMatches.get(p.id) ?? null,
      learnedCategory: (() => {
        const key = p.merchant ?? p.bank;
        const memory = key ? merchantMemory.get(normalizeMerchantKey(key)) : undefined;
        if (!memory) return null;
        return {
          category: memory.customCategoryId ? null : memory.category,
          customCategoryName: memory.customCategoryId ? customCategoryNameById.get(memory.customCategoryId) ?? null : null,
          subCategory: memory.subCategory,
        };
      })(),
    })),
  };

  return <ImportsClient gmail={JSON.parse(JSON.stringify(gmail))} />;
}
