import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, ParsedTransactionPatchSchema } from "@/lib/validation";
import { applyCCEffect, reverseCCEffect } from "@/lib/cc-effects";
import { resolveCustomCategory } from "@/lib/custom-category";
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
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const updatedEntry = await db.monthlyEntry.update({
      where: { id: entry.id },
      data: computePaymentUpdate(netAmount, newPaidAmount),
    });

    await db.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });

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

  const isCC = existing.paymentMethod === "CREDIT_CARD";
  // A "credit"/"refund" email is money coming back, not a spend — every
  // transaction used to get filed as type: EXPENSE regardless, which
  // logged a refund as if it were a new charge.
  const isIncome = existing.transactionType === "CREDIT" || existing.transactionType === "REFUND";

  if (isCC) {
    const ccTemplateId = body.ccTemplateId ?? existing.suggestedCcTemplateId;
    if (!ccTemplateId) return NextResponse.json({ error: "Pick a card first" }, { status: 400 });

    if (isIncome) {
      // A refund/credit against the card reduces what's owed on the
      // statement — it isn't a new charge, so no AdHocItem is created for
      // it, and the effect is reversed instead of applied.
      const updatedEntry = await reverseCCEffect(userId, monthRow.id, ccTemplateId, finalDate, finalAmount);
      await db.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });
      return NextResponse.json({ item: null, updatedEntry });
    }

    const subcategory = body.subcategory ?? existing.suggestedSubcategory;

    const item = await db.adHocItem.create({
      data: {
        monthId: monthRow.id,
        name: finalName,
        amount: finalAmount,
        type: "EXPENSE",
        category: "CREDIT_CARD",
        ccTemplateId,
        date: finalDate,
        notes: [subcategory, "Imported from Gmail"].filter(Boolean).join(" · "),
      },
    });

    const updatedEntry = await applyCCEffect(userId, monthRow.id, ccTemplateId, finalDate, finalAmount);

    await db.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });

    return NextResponse.json({ item, updatedEntry });
  }

  // UPI / debit card / other — a plain ad-hoc item, no CC statement math.
  if (isIncome) {
    const item = await db.adHocItem.create({
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
    await db.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });
    return NextResponse.json({ item, updatedEntry: null });
  }

  const customCat = body.customCategory ? await resolveCustomCategory(userId, body.customCategory) : null;

  const item = await db.adHocItem.create({
    data: {
      monthId: monthRow.id,
      name: finalName,
      amount: finalAmount,
      type: "EXPENSE",
      category: customCat ? null : ((body.category as Category | undefined) ?? "MISCELLANEOUS"),
      customCategory: customCat?.name ?? null,
      customCategoryId: customCat?.id ?? null,
      date: finalDate,
      notes: "Imported from Gmail",
    },
  });

  await db.parsedTransaction.update({ where: { id }, data: { status: "APPROVED" } });

  return NextResponse.json({ item, updatedEntry: null });
}
