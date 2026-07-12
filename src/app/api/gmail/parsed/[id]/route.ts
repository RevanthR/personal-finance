import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, ParsedTransactionPatchSchema } from "@/lib/validation";
import { applyCCEffect } from "@/lib/cc-effects";
import { resolveCustomCategory } from "@/lib/custom-category";
import type { Category } from "@/generated/prisma/client";

// PATCH /api/gmail/parsed/[id] — approve (creates the real AdHocItem via
// the same cc-effects path the manual ad-hoc dialog uses) or reject a
// pending suggestion. Nothing here is reachable without the user acting on
// a specific review-queue row.
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

  if (isCC) {
    const ccTemplateId = body.ccTemplateId ?? existing.suggestedCcTemplateId;
    if (!ccTemplateId) return NextResponse.json({ error: "Pick a card first" }, { status: 400 });

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

  // UPI / debit card / other — a plain ad-hoc expense, no CC statement math.
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
