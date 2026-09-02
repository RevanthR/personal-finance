import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, ParsedTransactionPatchSchema } from "@/lib/validation";
import { ensureCurrentStatement, getCardsOverview } from "@/lib/cards-db";
import { resolveCustomCategory } from "@/lib/custom-category";
import { resolveSubCategory } from "@/lib/sub-category";
import { rememberMerchantCategory } from "@/lib/merchant-memory";
import { computePaymentUpdate } from "@/lib/entry-payment";
import { notifyReviewProgress } from "@/lib/gmail/sync";
import { closePushForUser, PAYMENT_REMINDER_PUSH_TAG } from "@/lib/push";
import type { Category } from "@/generated/prisma/client";

// PATCH /api/gmail/parsed/[id] — approve (creates the real AdHocItem, the
// same as the manual ad-hoc dialog), settle (pays down an existing
// recurring entry, or marks a card's open statement paid, instead of
// creating a new expense — see src/lib/gmail/entry-match.ts), or reject a
// pending suggestion. Nothing here is reachable without the user acting on
// a specific review-queue row.
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
    await notifyReviewProgress(userId);
    return NextResponse.json({ item });
  }

  if (body.action === "settle") {
    const settleAmount = body.amount ?? existing.amount;

    // Card bill payment: mark the card's most recently closed CardStatement
    // paid (the same target as the manual /cards Pay button), not a
    // MonthlyEntry — cards don't have those any more (src/lib/cards.ts).
    if (body.cardId) {
      const card = await db.creditCard.findFirst({
        where: { id: body.cardId, userId },
        select: { id: true, userId: true, template: { select: { statementDay: true, dueDateDay: true } } },
      });
      if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
      if (card.template.statementDay == null) {
        return NextResponse.json({ error: "Set a statement date on this card first" }, { status: 400 });
      }

      const overview = (await getCardsOverview(userId)).find(c => c.cardId === card.id);
      const remaining = overview?.status.statementBalance ?? 0;
      const gross = overview?.status.statementGross ?? 0;

      await db.$transaction(async (tx) => {
        const stmt = await ensureCurrentStatement(tx, {
          id: card.id, userId: card.userId,
          statementDay: card.template.statementDay, dueDateDay: card.template.dueDateDay,
        });
        if (!stmt) throw new Error("no cycle to pay");
        const newPaid = stmt.paidAmount + settleAmount;
        // Treat a payment that clears (or overpays) the outstanding balance
        // as paid-in-full — a card bill payment often rounds up or pays
        // slightly ahead, and the extra just carries against next cycle.
        const clearsIt = settleAmount + 0.5 >= remaining || newPaid + stmt.cashback + 0.5 >= gross;
        await tx.cardStatement.update({
          where: { id: stmt.id },
          data: { paidAmount: newPaid, paidInFull: clearsIt, paidAt: new Date() },
        });
        await tx.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });
      });

      await notifyReviewProgress(userId);
      await closePushForUser(userId, PAYMENT_REMINDER_PUSH_TAG, "/dashboard").catch(() => {});
      return NextResponse.json({ item: null, updatedEntry: null });
    }

    if (!body.entryId) return NextResponse.json({ error: "Missing entryId" }, { status: 400 });

    const entry = await db.monthlyEntry.findFirst({
      where: { id: body.entryId, month: { userId } },
      select: {
        id: true, templateId: true, amount: true, cashbackAmount: true, paidAmount: true, isPaid: true,
        month: { select: { id: true, month: true, year: true } },
      },
    });
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    const updatedEntry = await db.$transaction(async (tx) => {
      const netAmount = entry.amount - (entry.cashbackAmount ?? 0);
      // Accumulate onto whatever's already been paid this month — two
      // partial payments toward the same bill (a part-payment now, the rest
      // later) both need to count, not overwrite each other.
      const newPaidAmount = (entry.paidAmount ?? 0) + settleAmount;
      const updatedEntry = await tx.monthlyEntry.update({
        where: { id: entry.id },
        data: computePaymentUpdate(netAmount, newPaidAmount),
      });
      await tx.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });
      return updatedEntry;
    });

    await notifyReviewProgress(userId);
    // Same reasoning as the manual pay dialog — settling a bill via a
    // matched Gmail transaction is still "you paid something", so the
    // payment-due reminder banner is just as stale on every device.
    if (updatedEntry.isPaid && !entry.isPaid) {
      await closePushForUser(userId, PAYMENT_REMINDER_PUSH_TAG, "/dashboard").catch(() => {});
    }
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
  // on the AdHocItem row unverified.
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

  // Every terminal branch below writes an AdHocItem and marks the
  // ParsedTransaction APPROVED together, inside one transaction — separate
  // calls could create the expense while leaving the review-queue row stuck
  // PENDING, or vice versa. A CC charge is just an AdHocItem tagged with
  // ccTemplateId; the card's bill is derived from those (src/lib/cards.ts).
  if (isCC) {
    if (isIncome) {
      // Two different things both show up as "isCC && isIncome": a merchant
      // refund on a past card purchase (paymentMethod CREDIT_CARD — see the
      // payment-method guidance in extract.ts), and money paid TOWARD the
      // card's own bill from an external source, bank transfer/UPI/autopay
      // (paymentMethod OTHER/UPI/DEBIT_CARD alongside a card selected here
      // — same convention the indusind-bill-payment known-template already
      // relies on). A merchant refund is still meaningfully "spend, just
      // reversed" and keeps a category. A bill payment isn't spending in
      // any category at all — it's a transfer — so it gets no category and
      // is flagged isCardRepayment so the UI can exclude it from category
      // totals and the Daily Spend breakdown entirely instead of just
      // netting it to zero there.
      const isCardRepayment = existing.paymentMethod !== "CREDIT_CARD";

      // A refund/credit against the card reduces what's owed on the
      // statement rather than adding a new charge — but it still has to be
      // a real, queryable row (isCredit: true) rather than a bare arithmetic
      // adjustment, since a post-close statement total is re-summed from
      // scratch on every subsequent charge; a decrement with no persisted
      // trace would just get silently erased by the next resum.
      const customCat = !isCardRepayment && body.customCategory ? await resolveCustomCategory(userId, body.customCategory) : null;
      const resolvedCategory = isCardRepayment
        ? null
        : ((customCat ? "MISCELLANEOUS" : (body.category as Category | undefined)) ?? "MISCELLANEOUS");
      const subCategory = !isCardRepayment && body.subCategory
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
            ccTemplateId,
            isCredit: true,
            isCardRepayment,
            date: finalDate,
            notes: isCardRepayment ? "Card repayment imported from Gmail" : "Refund/credit imported from Gmail",
          },
        });
        await tx.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });
        return item;
      });
      await notifyReviewProgress(userId);
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
          ccTemplateId,
          date: finalDate,
          notes: "Imported from Gmail",
        },
      });
      await tx.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });
      return item;
    });
    await rememberMerchantCategory(userId, finalName, { category: resolvedCategory, customCategoryId: customCat?.id ?? null, subCategory });
    await notifyReviewProgress(userId);

    return NextResponse.json({ item, updatedEntry: null });
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
    await notifyReviewProgress(userId);
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
  await notifyReviewProgress(userId);

  return NextResponse.json({ item, updatedEntry: null });
}
