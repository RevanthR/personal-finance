import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { Category } from "@/generated/prisma/client";
import { revalidateTag } from "next/cache";
import { templateCacheTag } from "@/lib/cached-queries";
import { validate, TemplatePatchSchema } from "@/lib/validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { templateId } = await params;

  const parsed = validate(TemplatePatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const isCustom = body.customCategory != null && body.customCategory !== "";

  try {
    await db.lineItemTemplate.updateMany({
      where: { id: templateId, userId: session.user.id },
      data: {
        ...(body.name     !== undefined && { name: body.name }),
        ...(body.category !== undefined && {
          category: (isCustom ? "MISCELLANEOUS" : body.category) as Category,
          customCategory: isCustom ? body.customCategory : null,
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
  } catch (err) {
    console.error("[PATCH /templates] error:", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Optionally apply the new amount to the current month's entry (creates it if missing)
  if (body.updateCurrentMonth && body.amount !== undefined) {
    const now = new Date();
    const currentMonth = await db.month.findUnique({
      where: { userId_month_year: { userId: session.user.id, month: now.getMonth() + 1, year: now.getFullYear() } },
    });
    if (currentMonth) {
      await db.monthlyEntry.upsert({
        where: { monthId_templateId: { monthId: currentMonth.id, templateId } },
        create: { monthId: currentMonth.id, templateId, amount: body.amount },
        update: { amount: body.amount },
      });
    }
  }

  // If foreclosing, optionally add a one-off expense to the current month
  if (body.foreClosedOn && body.addToCurrentMonth && body.foreCloseAmount) {
    const now = new Date();
    const currentMonth = await db.month.findFirst({
      where: { userId: session.user.id, month: now.getMonth() + 1, year: now.getFullYear() },
    });
    if (currentMonth) {
      const template = await db.lineItemTemplate.findFirst({
        where: { id: templateId, userId: session.user.id },
      });
      await db.adHocItem.create({
        data: {
          monthId: currentMonth.id,
          name: `Foreclosure ${template?.name ?? ""}`.trim(),
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

  const updatedTemplate = await db.lineItemTemplate.findFirst({
    where: { id: templateId, userId: session.user.id },
    include: { chitFund: true },
  });
  return NextResponse.json(updatedTemplate);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { templateId } = await params;

  await db.lineItemTemplate.deleteMany({
    where: { id: templateId, userId: session.user.id },
  });

  revalidateTag(templateCacheTag, {});
  return NextResponse.json({ ok: true });
}
