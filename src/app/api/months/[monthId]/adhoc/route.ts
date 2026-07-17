import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { AdHocType, Category } from "@/generated/prisma/client";
import { validate, AdHocPostSchema, AdHocPatchSchema } from "@/lib/validation";
import { resolveCustomCategory } from "@/lib/custom-category";
import { applyCCEffect, reverseCCEffect, type EntryFields } from "@/lib/cc-effects";

// POST /api/months/[monthId]/adhoc
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ monthId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { monthId } = await params;

  const parsed = validate(AdHocPostSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const month = await db.month.findFirst({ where: { id: monthId, userId } });
  if (!month) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const customCat = body.customCategory ? await resolveCustomCategory(userId, body.customCategory) : null;

  const item = await db.adHocItem.create({
    data: {
      monthId,
      name: body.name,
      amount: body.amount,
      type: body.type as AdHocType,
      category: body.category as Category | undefined,
      customCategory: customCat?.name ?? null,
      customCategoryId: customCat?.id ?? null,
      ccTemplateId: body.ccTemplateId ?? null,
      date: new Date(body.date),
      notes: body.notes ?? null,
    },
  });

  let updatedEntry: EntryFields | null = null;
  if (body.type === "EXPENSE" && body.ccTemplateId) {
    updatedEntry = await applyCCEffect(userId, monthId, body.ccTemplateId, new Date(body.date), body.amount);
  }

  return NextResponse.json({ item, updatedEntry }, { status: 201 });
}

// PATCH /api/months/[monthId]/adhoc — edit any field except type.
// Type stays locked because switching income/expense would move the value
// between totally different totals (income panel vs expense list) rather
// than just changing how one line reads — better handled as delete + re-add.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ monthId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { monthId } = await params;

  const parsed = validate(AdHocPatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const existing = await db.adHocItem.findFirst({
    where: { id: body.id, monthId, month: { userId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Resolve the next value of every field — provided value wins, else keep existing.
  const nextName     = body.name ?? existing.name;
  const nextAmount   = body.amount ?? existing.amount;
  const nextDate     = body.date ? new Date(body.date) : existing.date;
  const nextNotes    = body.notes !== undefined ? body.notes : existing.notes;
  const nextCategory = body.category !== undefined ? (body.category as Category | null) : existing.category;
  const nextCCTemplateId = body.ccTemplateId !== undefined
    ? (body.ccTemplateId || null)
    : existing.ccTemplateId;

  // A category chip pick (no accompanying customCategory) clears any custom label.
  const customCat = body.customCategory
    ? await resolveCustomCategory(userId, body.customCategory)
    : body.category !== undefined ? null : undefined; // undefined = leave as-is

  const item = await db.adHocItem.update({
    where: { id: body.id },
    data: {
      name: nextName,
      amount: nextAmount,
      date: nextDate,
      notes: nextNotes,
      category: nextCategory,
      ccTemplateId: nextCCTemplateId,
      ...(customCat !== undefined && {
        customCategory: customCat?.name ?? null,
        customCategoryId: customCat?.id ?? null,
      }),
    },
  });

  // Reverse the old CC effect, then apply the new one. Order matters: the
  // row above is already updated to its new values before either call, so
  // a card/category change correctly excludes this item from the OLD
  // card's live re-sum, and includes it in the NEW card's.
  const updatedEntries = new Map<string, EntryFields>();
  if (existing.type === "EXPENSE" && existing.ccTemplateId) {
    const reversed = await reverseCCEffect(userId, monthId, existing.ccTemplateId, existing.date, existing.amount);
    if (reversed) updatedEntries.set(reversed.id, reversed);
  }
  if (item.type === "EXPENSE" && item.ccTemplateId) {
    const applied = await applyCCEffect(userId, monthId, item.ccTemplateId, nextDate, nextAmount);
    if (applied) updatedEntries.set(applied.id, applied);
  }

  return NextResponse.json({ item, updatedEntries: [...updatedEntries.values()] });
}

// DELETE /api/months/[monthId]/adhoc?id=xxx
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ monthId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { monthId } = await params;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const item = await db.adHocItem.findFirst({
    where: { id, monthId, month: { userId } },
  });

  // Delete first, then recompute so the deleted item is excluded from the sum
  await db.adHocItem.deleteMany({
    where: { id, monthId, month: { userId } },
  });

  let updatedEntry: EntryFields | null = null;
  if (item?.type === "EXPENSE" && item.ccTemplateId) {
    updatedEntry = await reverseCCEffect(userId, monthId, item.ccTemplateId, item.date, item.amount);
  }

  return NextResponse.json({ ok: true, updatedEntry });
}
