import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { AdHocType, Category } from "@/generated/prisma/client";
import { validate, AdHocPostSchema, AdHocPatchSchema } from "@/lib/validation";
import { resolveCustomCategory } from "@/lib/custom-category";

type EntryFields = { id: string; amount: number; statementAmount: number | null; billedAmount: number | null };

// Recompute statementAmount for a CC card from ALL current post-close
// adHocItems linked to it. Idempotent and self-healing regardless of past
// accumulation bugs — always re-sums live rows rather than adjusting deltas.
async function recomputeStatementAmount(
  entryId: string,
  monthId: string,
  ccTemplateId: string,
  statementDay: number | null,
): Promise<EntryFields> {
  const cardItems = await db.adHocItem.findMany({
    where: { monthId, type: "EXPENSE", category: "CREDIT_CARD", ccTemplateId },
    select: { amount: true, date: true },
  });

  const postCloseTotal = cardItems
    .filter(i => {
      const day = new Date(i.date).getDate();
      return statementDay === null || day > statementDay;
    })
    .reduce((sum, i) => sum + i.amount, 0);

  return db.monthlyEntry.update({
    where: { id: entryId },
    data: { statementAmount: postCloseTotal },
    select: { id: true, amount: true, statementAmount: true, billedAmount: true },
  });
}

// Apply a CC charge's effect onto its card's MonthlyEntry (creating the
// entry if this is the first charge against it this month).
async function applyCCEffect(
  userId: string,
  monthId: string,
  ccTemplateId: string,
  date: Date,
  amount: number,
): Promise<EntryFields | null> {
  const template = await db.lineItemTemplate.findFirst({
    where: { id: ccTemplateId, userId, category: "CREDIT_CARD" },
  });
  if (!template) return null;

  let entry = await db.monthlyEntry.findUnique({
    where: { monthId_templateId: { monthId, templateId: ccTemplateId } },
  });
  if (!entry) {
    entry = await db.monthlyEntry.create({
      data: { monthId, templateId: ccTemplateId, amount: 0, billedAmount: 0, isPaid: false, statementAmount: 0 },
    });
  }

  const statementDay = template.statementDay ?? null;
  const isPreClose = statementDay !== null && date.getDate() <= statementDay;

  if (isPreClose) {
    return db.monthlyEntry.update({
      where: { id: entry.id },
      data: {
        amount: entry.amount + amount,
        billedAmount: (entry.billedAmount ?? entry.amount) + amount,
      },
      select: { id: true, amount: true, statementAmount: true, billedAmount: true },
    });
  }
  return recomputeStatementAmount(entry.id, monthId, ccTemplateId, statementDay);
}

// Reverse a CC charge's effect off its card's MonthlyEntry. Call this
// BEFORE the AdHocItem row is deleted (post-close needs it excluded from
// the live re-sum) or AFTER it's been updated to new values (edit — the
// captured old amount is used for the delta, not the row's current state).
async function reverseCCEffect(
  userId: string,
  monthId: string,
  ccTemplateId: string,
  date: Date,
  amount: number,
): Promise<EntryFields | null> {
  const entry = await db.monthlyEntry.findFirst({
    where: { monthId, template: { id: ccTemplateId, category: "CREDIT_CARD", userId } },
    select: {
      id: true, amount: true, statementAmount: true, billedAmount: true,
      template: { select: { statementDay: true } },
    },
  });
  if (!entry) return null;

  const statementDay = entry.template.statementDay ?? null;
  const isPreClose = statementDay !== null && date.getDate() <= statementDay;

  if (isPreClose) {
    return db.monthlyEntry.update({
      where: { id: entry.id },
      data: {
        amount: Math.max(0, entry.amount - amount),
        billedAmount: Math.max(0, (entry.billedAmount ?? entry.amount) - amount),
      },
      select: { id: true, amount: true, statementAmount: true, billedAmount: true },
    });
  }
  return recomputeStatementAmount(entry.id, monthId, ccTemplateId, statementDay);
}

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
      ccTemplateId: body.category === "CREDIT_CARD" ? (body.ccTemplateId ?? null) : null,
      date: new Date(body.date),
      notes: body.notes ?? null,
    },
  });

  let updatedEntry: EntryFields | null = null;
  if (body.type === "EXPENSE" && body.category === "CREDIT_CARD" && body.ccTemplateId) {
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
  const nextCCTemplateId = nextCategory === "CREDIT_CARD"
    ? (body.ccTemplateId ?? existing.ccTemplateId)
    : null;

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
  if (existing.type === "EXPENSE" && existing.category === "CREDIT_CARD" && existing.ccTemplateId) {
    const reversed = await reverseCCEffect(userId, monthId, existing.ccTemplateId, existing.date, existing.amount);
    if (reversed) updatedEntries.set(reversed.id, reversed);
  }
  if (item.type === "EXPENSE" && item.category === "CREDIT_CARD" && item.ccTemplateId) {
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
  if (item?.category === "CREDIT_CARD" && item.type === "EXPENSE" && item.ccTemplateId) {
    updatedEntry = await reverseCCEffect(userId, monthId, item.ccTemplateId, item.date, item.amount);
  }

  return NextResponse.json({ ok: true, updatedEntry });
}
