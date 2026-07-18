import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { Category } from "@/generated/prisma/client";
import { revalidateTag } from "next/cache";
import { templateCacheTag } from "@/lib/cached-queries";
import { validate, TemplatePatchSchema } from "@/lib/validation";
import { resolveCustomCategory } from "@/lib/custom-category";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { templateId } = await params;

  const parsed = validate(TemplatePatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const isCustom = body.customCategory != null && body.customCategory !== "";
  const customCat = isCustom ? await resolveCustomCategory(session.user.id, body.customCategory!) : null;

  let updateCount: number;
  try {
    const result = await db.lineItemTemplate.updateMany({
      where: { id: templateId, userId: session.user.id },
      data: {
        ...(body.name     !== undefined && { name: body.name }),
        ...(body.category !== undefined && {
          category: (isCustom ? "MISCELLANEOUS" : body.category) as Category,
          customCategory: customCat?.name ?? null,
          customCategoryId: customCat?.id ?? null,
        }),
        ...(body.amount       !== undefined && { amount: body.amount }),
        ...(body.isFixed      !== undefined && { isFixed: body.isFixed }),
        ...(body.dueDateDay   !== undefined && { dueDateDay: body.dueDateDay }),
        ...(body.statementDay !== undefined && { statementDay: body.statementDay }),
        ...(body.frequency    !== undefined && { frequency: body.frequency }),
        ...(body.dueMonth     !== undefined && { dueMonth: body.dueMonth }),
        ...(body.isActive     !== undefined && { isActive: body.isActive }),
        ...(body.sortOrder    !== undefined && { sortOrder: body.sortOrder }),
        ...(body.foreClosedOn !== undefined && { foreClosedOn: body.foreClosedOn ? new Date(body.foreClosedOn) : null }),
        ...(body.foreCloseAmount !== undefined && { foreCloseAmount: body.foreCloseAmount }),
        ...(body.pendingAmount    !== undefined && { pendingAmount: body.pendingAmount }),
        ...(body.pendingFromMonth !== undefined && { pendingFromMonth: body.pendingFromMonth }),
        ...(body.pendingFromYear  !== undefined && { pendingFromYear: body.pendingFromYear }),
        ...(body.clearPending && { pendingAmount: null, pendingFromMonth: null, pendingFromYear: null }),
        ...(body.endsOnMonth !== undefined && { endsOnMonth: body.endsOnMonth }),
        ...(body.endsOnYear  !== undefined && { endsOnYear: body.endsOnYear }),
        ...(body.clearEndDate && { endsOnMonth: null, endsOnYear: null }),
        ...(body.loanOriginalPrincipal   !== undefined && { loanOriginalPrincipal: body.loanOriginalPrincipal }),
        ...(body.loanInterestRate        !== undefined && { loanInterestRate: body.loanInterestRate }),
        ...(body.loanRateType            !== undefined && { loanRateType: body.loanRateType }),
        ...(body.loanStartDate           !== undefined && { loanStartDate: body.loanStartDate ? new Date(body.loanStartDate) : null }),
        ...(body.loanOutstandingOverride !== undefined && { loanOutstandingOverride: body.loanOutstandingOverride }),
      },
    });
    updateCount = result.count;
  } catch (err) {
    console.error("[PATCH /templates] error:", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  // updateMany scoped by userId silently matches nothing for a foreign or
  // bad templateId — previously returned 200 with updatedTemplate: null
  // instead of a real 404, unlike every other findFirst-then-404 route.
  if (updateCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetched once and reused below (foreclosure name, amount-sync check,
  // response body) instead of a second identical findFirst.
  const updatedTemplate = await db.lineItemTemplate.findFirst({
    where: { id: templateId, userId: session.user.id },
    include: { chitFund: true },
  });

  // If foreclosing, optionally add a one-off expense to the current month
  if (body.foreClosedOn && body.addToCurrentMonth && body.foreCloseAmount) {
    const now = new Date();
    const currentMonth = await db.month.findFirst({
      where: { userId: session.user.id, month: now.getMonth() + 1, year: now.getFullYear() },
    });
    if (currentMonth) {
      await db.adHocItem.create({
        data: {
          monthId: currentMonth.id,
          name: `Foreclosure ${updatedTemplate?.name ?? ""}`.trim(),
          amount: body.foreCloseAmount,
          type: "EXPENSE",
          category: "LOAN",
          date: new Date(body.foreClosedOn),
          notes: body.note ?? null,
        },
      });
    }
  }

  revalidateTag(templateCacheTag, {});

  // Auto-apply amount change to current month's existing unpaid entry (expense templates only)
  if (body.amount !== undefined && updatedTemplate?.templateType !== "INCOME") {
    const now = new Date();
    const currentMonth = await db.month.findUnique({
      where: { userId_month_year: { userId: session.user.id, month: now.getMonth() + 1, year: now.getFullYear() } },
      select: { id: true },
    });
    if (currentMonth) {
      await db.monthlyEntry.updateMany({
        where: { monthId: currentMonth.id, templateId, isPaid: false },
        data: { amount: body.amount },
      });
    }
  }

  return NextResponse.json(updatedTemplate);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { templateId } = await params;

  await db.lineItemTemplate.deleteMany({
    where: { id: templateId, userId: session.user.id },
  });

  revalidateTag(templateCacheTag, {});
  return NextResponse.json({ ok: true });
}
