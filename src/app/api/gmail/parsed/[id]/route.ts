import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, ParsedTransactionPatchSchema } from "@/lib/validation";
import { applyCCEffect, reverseCCEffect } from "@/lib/cc-effects";
import { resolveCustomCategory } from "@/lib/custom-category";
import { resolveSubCategory } from "@/lib/sub-category";
import { rememberMerchantCategory } from "@/lib/merchant-memory";
import { computePaymentUpdate } from "@/lib/entry-payment";
import type { Category } from "@/generated/prisma/client";

// PATCH /api/gmail/parsed/[id] — approve (creates the real AdHocItem via
// the same cc-effects path the manual ad-hoc dialog uses), settle (pays
// down an existing recurring/CC entry instead of creating a new expense —
// see src/lib/gmail/entry-match.ts), or reject a pending suggestion.
// Nothing here is reachable without the user acting on a specific
// review-queue row.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;

  const parsed = validate(ParsedTransactionPatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const existing = await db.parsedTransaction.findFirst({
    where: { id, userId, status: "PENDING" },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "reject") {
    const item = await db.parsedTransaction.update({ where: { id }, data: { status: "REJECTED" } });
    return NextResponse.json({ item });
  }

  if (body.action === "settle") {
    if (!body.entryId) return NextResponse.json({ error: "Missing entryId" }, { status: 400 });

    const entry = await db.monthlyEntry.findFirst({
      where: { id: body.entryId, month: { userId } },
      select: { id: true, amount: true, cashbackAmount: true, paidAmount: true },
    });
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    const settleAmount = body.amount ?? existing.amount;
    const netAmount = entry.amount - (entry.cashbackAmount ?? 0);
    // Accumulate onto whatever's already been paid this month — two
    // partial payments toward the same bill (e.g. a part-payment now, the
    // rest later) both need to count, not overwrite each other.
    const newPaidAmount = (entry.paidAmount ?? 0) + settleAmount;

    const updatedEntry = await db.$transaction(async (tx) => {
      const updatedEntry = await tx.monthlyEntry.update({
        where: { id: entry.id },
        data: computePaymentUpdate(netAmount, newPaidAmount),
      });
      await tx.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });
      return updatedEntry;
    });

    return NextResponse.json({ item: null, updatedEntry });
  }

  const finalAmount = body.amount ?? existing.amount;
  const finalDate = body.date ? new Date(body.date) : existing.date;
  const finalName = body.merchant ?? existing.merchant ?? existing.bank;

  const month = finalDate.getMonth() + 1;
  const year = finalDate.getFullYear();
  const monthRow = await db.month.findFirst({ where: { userId, month, year } });
  if (!monthRow) {
    return NextResponse.json(
      { error: `Open ${month}/${year} in the app first, then approve this` },
      { status: 400 },
    );
  }

  // Payment method is whatever the user confirmed in the review form
  // (defaulting to Gmail's guess, but overridable there) — not blindly
  // trusted from the parsed email, since a misclassified UPI-vs-card charge
  // has to be correctable before it hits card statement math.
  const ccTemplateId = body.ccTemplateId || null;
  const isCC = !!ccTemplateId;

  // Reject a foreign/bad ccTemplateId outright instead of letting it persist
  // on the AdHocItem row unverified — applyCCEffect/reverseCCEffect already
  // scope their own lookup by userId, but that only skipped the statement
  // effect, not the stored reference itself.
  if (ccTemplateId) {
    const ccTemplate = await db.lineItemTemplate.findFirst({
      where: { id: ccTemplateId, userId, category: "CREDIT_CARD" },
      select: { id: true },
    });
    if (!ccTemplate) return NextResponse.json({ error: "Invalid card" }, { status: 400 });
  }
  // A "credit"/"refund" email is money coming back, not a spend — every
  // transaction used to get filed as type: EXPENSE regardless, which
  // logged a refund as if it were a new charge.
  const isIncome = existing.transactionType === "CREDIT" || existing.transactionType === "REFUND";

  // Every terminal branch below writes an AdHocItem (or a CC effect) and
  // marks the ParsedTransaction APPROVED together, inside one transaction
  // — previously separate calls, so a failure partway through could create
  // the expense (or reverse a CC effect) while leaving the review-queue row
  // stuck PENDING, or vice versa.
  if (isCC) {
    if (isIncome) {
      // A refund/credit against the card reduces what's owed on the
      // statement — it isn't a new charge, so no AdHocItem is created for
      // it, and the effect is reversed instead of applied.
      const updatedEntry = await db.$transaction(async (tx) => {
        const updatedEntry = await reverseCCEffect(tx, userId, monthRow.id, ccTemplateId, finalDate, finalAmount);
        await tx.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });
        return updatedEntry;
      });
      return NextResponse.json({ item: null, updatedEntry });
    }

    const customCat = body.customCategory ? await resolveCustomCategory(userId, body.customCategory) : null;
    const resolvedCategory = (customCat ? "MISCELLANEOUS" : (body.category as Category | undefined)) ?? "MISCELLANEOUS";
    const subCategory = body.subCategory
      ? await resolveSubCategory(userId, { category: resolvedCategory, customCategoryId: customCat?.id ?? null }, body.subCategory)
      : null;

    const { item, updatedEntry } = await db.$transaction(async (tx) => {
      const item = await tx.adHocItem.create({
        data: {
          monthId: monthRow.id,
          name: finalName,
          amount: finalAmount,
          type: "EXPENSE",
          category: resolvedCategory,
          customCategory: customCat?.name ?? null,
          customCategoryId: customCat?.id ?? null,
          subCategory,
          ccTemplateId,
          date: finalDate,
          notes: "Imported from Gmail",
        },
      });
      const updatedEntry = await applyCCEffect(tx, userId, monthRow.id, ccTemplateId, finalDate, finalAmount);
      await tx.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });
      return { item, updatedEntry };
    });
    await rememberMerchantCategory(userId, finalName, { category: resolvedCategory, customCategoryId: customCat?.id ?? null, subCategory });

    return NextResponse.json({ item, updatedEntry });
  }

  // Cash/UPI/debit — a plain ad-hoc item, no CC statement math.
  if (isIncome) {
    const item = await db.$transaction(async (tx) => {
      const item = await tx.adHocItem.create({
        data: {
          monthId: monthRow.id,
          name: finalName,
          amount: finalAmount,
          type: "INCOME",
          category: "OTHER_INCOME",
          date: finalDate,
          notes: "Imported from Gmail",
        },
      });
      await tx.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });
      return item;
    });
    return NextResponse.json({ item, updatedEntry: null });
  }

  const customCat = body.customCategory ? await resolveCustomCategory(userId, body.customCategory) : null;
  const resolvedCategory = (customCat ? "MISCELLANEOUS" : (body.category as Category | undefined)) ?? "MISCELLANEOUS";
  const subCategory = body.subCategory
    ? await resolveSubCategory(userId, { category: resolvedCategory, customCategoryId: customCat?.id ?? null }, body.subCategory)
    : null;

  const item = await db.$transaction(async (tx) => {
    const item = await tx.adHocItem.create({
      data: {
        monthId: monthRow.id,
        name: finalName,
        amount: finalAmount,
        type: "EXPENSE",
        category: resolvedCategory,
        customCategory: customCat?.name ?? null,
        customCategoryId: customCat?.id ?? null,
        subCategory,
        date: finalDate,
        notes: "Imported from Gmail",
      },
    });
    await tx.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });
    return item;
  });
  await rememberMerchantCategory(userId, finalName, { category: resolvedCategory, customCategoryId: customCat?.id ?? null, subCategory });

  return NextResponse.json({ item, updatedEntry: null });
}
