import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { Category } from "@/generated/prisma/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { templateId } = await params;
  const body = await req.json();

  const isCustom = Boolean(body.customCategory);

  const updated = await db.lineItemTemplate.updateMany({
    where: { id: templateId, userId: session.user.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.category !== undefined && {
        category: (isCustom ? "MISCELLANEOUS" : body.category) as Category,
        customCategory: isCustom ? body.customCategory : null,
      }),
      ...(body.amount !== undefined && { amount: body.amount }),
      ...(body.isFixed !== undefined && { isFixed: body.isFixed }),
      ...(body.dueDateDay !== undefined && { dueDateDay: body.dueDateDay }),
      ...(body.statementDay !== undefined && { statementDay: body.statementDay }),
      ...(body.frequency !== undefined && { frequency: body.frequency }),
      ...(body.dueMonth !== undefined && { dueMonth: body.dueMonth }),
      // templateType is not in the Prisma updateMany runtime validation — skip it in PATCH
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      ...(body.foreClosedOn !== undefined && { foreClosedOn: new Date(body.foreClosedOn) }),
      ...(body.foreCloseAmount !== undefined && { foreCloseAmount: Number(body.foreCloseAmount) }),
      // Pending scheduled amount change
      ...(body.pendingAmount !== undefined && { pendingAmount: body.pendingAmount }),
      ...(body.pendingFromMonth !== undefined && { pendingFromMonth: body.pendingFromMonth }),
      ...(body.pendingFromYear !== undefined && { pendingFromYear: body.pendingFromYear }),
      ...(body.clearPending && { pendingAmount: null, pendingFromMonth: null, pendingFromYear: null }),
      // End date
      ...(body.endsOnMonth !== undefined && { endsOnMonth: body.endsOnMonth }),
      ...(body.endsOnYear !== undefined && { endsOnYear: body.endsOnYear }),
      ...(body.clearEndDate && { endsOnMonth: null, endsOnYear: null }),
    },
  });

  // Optionally apply the new amount to the current month's existing entry
  if (body.updateCurrentMonth && body.amount !== undefined) {
    const now = new Date();
    const currentMonth = await db.month.findFirst({
      where: { userId: session.user.id, month: now.getMonth() + 1, year: now.getFullYear() },
    });
    if (currentMonth) {
      await db.monthlyEntry.updateMany({
        where: { monthId: currentMonth.id, templateId },
        data: { amount: body.amount },
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
          name: `Foreclosure — ${template?.name ?? ""}`.trim(),
          amount: Number(body.foreCloseAmount),
          type: "EXPENSE",
          category: "LOAN",
          date: new Date(body.foreClosedOn),
          notes: body.note || null,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
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

  return NextResponse.json({ ok: true });
}
