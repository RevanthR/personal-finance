import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/api-auth";
import { getCurrentMonthYear } from "@/lib/utils";
import { rekeyCardStatements } from "@/lib/cards-db";
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
  const user = await requireApiUser();
  if (!user.ok) return user.response;
  const userId = user.id;

  const { templateId } = await params;

  const parsed = validate(TemplatePatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const isCustom = body.customCategory != null && body.customCategory !== "";
  const customCat = isCustom ? await resolveCustomCategory(userId, body.customCategory!) : null;

  let updateCount: number;
  try {
    const result = await db.lineItemTemplate.updateMany({
      where: { id: templateId, userId: userId },
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
    where: { id: templateId, userId: userId },
    include: { chitFund: true },
  });

  // Foreclosing settles the whole remaining balance in one lump sum — this
  // month's own EMI entry (already created when the month started, before
  // the foreclosure) would otherwise keep sitting there as a separate
  // still-owed payable for a loan that's now closed. Only removes an entry
  // that's still unpaid; one already paid this month was a real, separate
  // installment made before the foreclosure, not part of it.
  if (body.foreClosedOn) {
    const currentMonth = await db.month.findFirst({
      where: { userId, ...getCurrentMonthYear() },
    });
    if (currentMonth) {
      if (body.addToCurrentMonth && body.foreCloseAmount) {
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
      await db.monthlyEntry.deleteMany({
        where: { monthId: currentMonth.id, templateId, isPaid: false },
      });
    }
  }

  // Pushing a loan's EMI start date into the future means it hasn't
  // actually started yet — setupMonth's own start-date check (see
  // setup-month.ts) stops generating new bills for it going forward, but
  // the current month's entry may already have been created (e.g. right
  // when the loan was first added, before the start date was corrected).
  // Clean that up the same way foreclosure does above; only touches it
  // while still unpaid.
  if (body.loanStartDate !== undefined && updatedTemplate?.category === "LOAN" && updatedTemplate.loanStartDate) {
    const now = new Date();
    const loanStart = new Date(updatedTemplate.loanStartDate);
    const startsAfterNow = now.getUTCFullYear() < loanStart.getUTCFullYear()
      || (now.getUTCFullYear() === loanStart.getUTCFullYear() && now.getUTCMonth() < loanStart.getUTCMonth());
    if (startsAfterNow) {
      const currentMonth = await db.month.findFirst({
        where: { userId, ...getCurrentMonthYear() },
      });
      if (currentMonth) {
        await db.monthlyEntry.deleteMany({
          where: { monthId: currentMonth.id, templateId, isPaid: false },
        });
      }
    }
  }

  // A card's billing days moved: keep its statements attached to their cycles.
  if (updatedTemplate?.category === "CREDIT_CARD" && (body.statementDay !== undefined || body.dueDateDay !== undefined)) {
    await rekeyCardStatements(db, templateId);
  }

  revalidateTag(templateCacheTag, {});

  // Auto-apply amount change to current month's existing unpaid entry (expense templates only)
  if (body.amount !== undefined && updatedTemplate?.templateType !== "INCOME") {
    const currentMonth = await db.month.findUnique({
      where: { userId_month_year: { userId, ...getCurrentMonthYear() } },
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
  const user = await requireApiUser();
  if (!user.ok) return user.response;
  const userId = user.id;

  const { templateId } = await params;

  const template = await db.lineItemTemplate.findFirst({
    where: { id: templateId, userId },
    select: {
      id: true,
      _count: { select: { entries: { where: { OR: [{ isPaid: true }, { paidAmount: { gt: 0 } }] } }, adHocCharges: true } },
      creditCard: { select: { _count: { select: { statements: true } } } },
    },
  });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A hard delete cascades to every past entry, its payment history and the
  // cash ledger rows behind it, which rewrites old months and moves the cash
  // balance. Anything with real history is archived instead (stops showing
  // up in new months, past months stay as they were).
  const hasHistory = template._count.entries > 0
    || template._count.adHocCharges > 0
    || (template.creditCard?._count.statements ?? 0) > 0;

  if (hasHistory) {
    const { month, year } = getCurrentMonthYear();
    await db.$transaction([
      db.lineItemTemplate.update({ where: { id: templateId }, data: { isActive: false } }),
      // This month's still-unpaid bill for it goes away, same as foreclosure.
      db.monthlyEntry.deleteMany({ where: { templateId, isPaid: false, paidAmount: null, month: { userId, month, year } } }),
    ]);
  } else {
    await db.lineItemTemplate.delete({ where: { id: templateId } });
  }

  revalidateTag(templateCacheTag, {});
  return NextResponse.json({ ok: true, archived: hasHistory });
}
