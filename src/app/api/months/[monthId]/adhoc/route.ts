import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { AdHocType, Category } from "@/generated/prisma/client";
import { validate, AdHocPostSchema, AdHocPatchSchema } from "@/lib/validation";
import { resolveCustomCategory } from "@/lib/custom-category";
import { resolveSubCategory } from "@/lib/sub-category";
import { applyCCEffect, reverseCCEffect, type EntryFields } from "@/lib/cc-effects";

// applyCCEffect/reverseCCEffect already no-op for a foreign ccTemplateId
// (they look it up scoped by userId), but that only skips the statement
// effect — the AdHocItem row itself previously still persisted whatever
// ccTemplateId the client sent, unverified. This rejects the write outright
// instead of silently storing a dangling/foreign card reference.
async function verifyCCTemplateOwnership(userId: string, ccTemplateId: string): Promise<boolean> {
  const template = await db.lineItemTemplate.findFirst({
    where: { id: ccTemplateId, userId, category: "CREDIT_CARD" },
    select: { id: true },
  });
  return !!template;
}

// POST /api/months/[monthId]/adhoc
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ monthId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { monthId } = await params;

  const parsed = validate(AdHocPostSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const month = await db.month.findFirst({ where: { id: monthId, userId } });
  if (!month) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.ccTemplateId && !(await verifyCCTemplateOwnership(userId, body.ccTemplateId))) {
    return NextResponse.json({ error: "Invalid card" }, { status: 400 });
  }

  // A top-level custom category (e.g. "Kids") forces category to
  // MISCELLANEOUS — same convention LineItemTemplate's custom-category
  // flow already uses.
  const customCat = body.customCategory ? await resolveCustomCategory(userId, body.customCategory) : null;
  const resolvedCategory = (customCat ? "MISCELLANEOUS" : body.category) as Category | undefined;
  const subCategory = body.subCategory
    ? await resolveSubCategory(userId, { category: resolvedCategory ?? null, customCategoryId: customCat?.id ?? null }, body.subCategory)
    : null;

  // The AdHocItem write and its CC statement-effect write must succeed or
  // fail together — separately committed, a failure between them could
  // record a charge without ever updating the card's bill.
  const { item, updatedEntry } = await db.$transaction(async (tx) => {
    const item = await tx.adHocItem.create({
      data: {
        monthId,
        name: body.name,
        amount: body.amount,
        type: body.type as AdHocType,
        category: resolvedCategory ?? null,
        customCategory: customCat?.name ?? null,
        customCategoryId: customCat?.id ?? null,
        subCategory,
        ccTemplateId: body.ccTemplateId ?? null,
        date: new Date(body.date),
        notes: body.notes ?? null,
      },
    });

    let updatedEntry: EntryFields | null = null;
    if (body.type === "EXPENSE" && body.ccTemplateId) {
      updatedEntry = await applyCCEffect(tx, userId, monthId, body.ccTemplateId, new Date(body.date), body.amount);
    }
    return { item, updatedEntry };
  });

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
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { monthId } = await params;

  const parsed = validate(AdHocPatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const existing = await db.adHocItem.findFirst({
    where: { id: body.id, monthId, month: { userId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.ccTemplateId && !(await verifyCCTemplateOwnership(userId, body.ccTemplateId))) {
    return NextResponse.json({ error: "Invalid card" }, { status: 400 });
  }

  // Resolve the next value of every field — provided value wins, else keep existing.
  const nextName     = body.name ?? existing.name;
  const nextAmount   = body.amount ?? existing.amount;
  const nextDate     = body.date ? new Date(body.date) : existing.date;
  const nextNotes    = body.notes !== undefined ? body.notes : existing.notes;
  const nextCCTemplateId = body.ccTemplateId !== undefined
    ? (body.ccTemplateId || null)
    : existing.ccTemplateId;

  // A category chip pick (no accompanying customCategory) clears any custom
  // top-level category, and forces category to MISCELLANEOUS when a new
  // custom category is picked instead — same convention as POST.
  const customCat = body.customCategory
    ? await resolveCustomCategory(userId, body.customCategory)
    : body.category !== undefined ? null : undefined; // undefined = leave as-is
  const nextCategory: Category | null = customCat
    ? "MISCELLANEOUS"
    : customCat === null
      ? (body.category as Category | null)
      : existing.category;
  const nextCustomCategoryId = customCat ? customCat.id : customCat === null ? null : existing.customCategoryId;

  // Sub-category: an explicit value updates or clears it. Otherwise, if the
  // parent category changed, the old sub-label no longer scopes to
  // anything real and is cleared; if the parent didn't change, it's left
  // as-is.
  const parentChanged = body.category !== undefined || body.customCategory !== undefined;
  const nextSubCategory = body.subCategory !== undefined
    ? (body.subCategory ? await resolveSubCategory(userId, { category: nextCategory, customCategoryId: nextCustomCategoryId }, body.subCategory) : null)
    : parentChanged ? null : undefined; // undefined = leave as-is

  // The AdHocItem write and both CC statement-effect writes (reverse old,
  // apply new) must succeed or fail together — see POST above.
  const { item, updatedEntries } = await db.$transaction(async (tx) => {
    const item = await tx.adHocItem.update({
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
        ...(nextSubCategory !== undefined && { subCategory: nextSubCategory }),
      },
    });

    // Reverse the old CC effect, then apply the new one. Order matters: the
    // row above is already updated to its new values before either call, so
    // a card/category change correctly excludes this item from the OLD
    // card's live re-sum, and includes it in the NEW card's.
    const updatedEntries = new Map<string, EntryFields>();
    if (existing.type === "EXPENSE" && existing.ccTemplateId) {
      const reversed = await reverseCCEffect(tx, userId, monthId, existing.ccTemplateId, existing.date, existing.amount);
      if (reversed) updatedEntries.set(reversed.id, reversed);
    }
    if (item.type === "EXPENSE" && item.ccTemplateId) {
      const applied = await applyCCEffect(tx, userId, monthId, item.ccTemplateId, nextDate, nextAmount);
      if (applied) updatedEntries.set(applied.id, applied);
    }
    return { item, updatedEntries };
  });

  return NextResponse.json({ item, updatedEntries: [...updatedEntries.values()] });
}

// DELETE /api/months/[monthId]/adhoc?id=xxx
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ monthId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { monthId } = await params;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const item = await db.adHocItem.findFirst({
    where: { id, monthId, month: { userId } },
  });

  // Delete and the CC statement-effect reversal must succeed or fail
  // together — see POST above.
  const updatedEntry = await db.$transaction(async (tx) => {
    // Delete first, then recompute so the deleted item is excluded from the sum
    await tx.adHocItem.deleteMany({
      where: { id, monthId, month: { userId } },
    });

    let updatedEntry: EntryFields | null = null;
    if (item?.type === "EXPENSE" && item.ccTemplateId) {
      updatedEntry = await reverseCCEffect(tx, userId, monthId, item.ccTemplateId, item.date, item.amount);
    }
    return updatedEntry;
  });

  return NextResponse.json({ ok: true, updatedEntry });
}
