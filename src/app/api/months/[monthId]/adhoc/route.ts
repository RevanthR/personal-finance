import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { AdHocType, Category } from "@/generated/prisma/client";
import { validate, AdHocPostSchema, AdHocPatchSchema } from "@/lib/validation";
import { resolveCustomCategory } from "@/lib/custom-category";
import { resolveSubCategory } from "@/lib/sub-category";
import { resolveMonthForDate } from "@/lib/months/resolve-month";

// A CC charge is just an AdHocItem tagged with ccTemplateId — the card's
// bill is derived from those rows + CardStatement (src/lib/cards.ts), never
// stored. This still rejects a foreign/bad ccTemplateId outright instead of
// persisting a dangling reference.
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

  // A repayment must say which card it's paying down — there's nothing to
  // reduce otherwise — and it isn't spending in any category, so any
  // category the client sent is ignored rather than validated.
  const isCardRepayment = body.type === "EXPENSE" && body.isCardRepayment === true;
  if (isCardRepayment && !body.ccTemplateId) {
    return NextResponse.json({ error: "A card repayment needs a card" }, { status: 400 });
  }

  // A top-level custom category (e.g. "Kids") forces category to
  // MISCELLANEOUS — same convention LineItemTemplate's custom-category
  // flow already uses.
  const customCat = !isCardRepayment && body.customCategory ? await resolveCustomCategory(userId, body.customCategory) : null;
  const resolvedCategory = isCardRepayment ? undefined : ((customCat ? "MISCELLANEOUS" : body.category) as Category | undefined);
  const subCategory = !isCardRepayment && body.subCategory
    ? await resolveSubCategory(userId, { category: resolvedCategory ?? null, customCategoryId: customCat?.id ?? null }, body.subCategory)
    : null;

  const date = new Date(body.date);
  // A date outside the viewed month files this under the month it actually
  // belongs to instead of blindly attaching it to whatever's in the URL —
  // see resolveMonthForDate for why that month has to already exist.
  const resolved = await resolveMonthForDate(db, userId, date, month);
  const targetMonthId = resolved.monthId;

  const item = await db.adHocItem.create({
    data: {
      monthId: targetMonthId,
      name: body.name,
      amount: body.amount,
      type: body.type as AdHocType,
      category: resolvedCategory ?? null,
      customCategory: customCat?.name ?? null,
      customCategoryId: customCat?.id ?? null,
      subCategory,
      ccTemplateId: body.ccTemplateId ?? null,
      isCredit: isCardRepayment,
      isCardRepayment,
      date,
      notes: body.notes ?? null,
    },
  });

  return NextResponse.json({
    item, updatedEntry: null,
    movedToMonth: resolved.moved ? { month: resolved.month, year: resolved.year } : null,
  }, { status: 201 });
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

  // Editing the date across a month boundary re-files the item under the
  // month it now actually belongs to (same reasoning as POST).
  let targetMonthId = monthId;
  let movedToMonth: { month: number; year: number } | null = null;
  if (body.date) {
    const viewedMonth = await db.month.findFirst({ where: { id: monthId, userId }, select: { id: true, month: true, year: true } });
    if (viewedMonth) {
      const resolved = await resolveMonthForDate(db, userId, nextDate, viewedMonth);
      if (resolved.moved) {
        targetMonthId = resolved.monthId;
        movedToMonth = { month: resolved.month, year: resolved.year };
      }
    }
  }

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

  const item = await db.adHocItem.update({
    where: { id: body.id },
    data: {
      monthId: targetMonthId,
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

  return NextResponse.json({ item, updatedEntries: [], movedToMonth });
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

  if (item) {
    await db.adHocItem.deleteMany({ where: { id, monthId, month: { userId } } });
  }

  return NextResponse.json({ ok: true, updatedEntry: null });
}
