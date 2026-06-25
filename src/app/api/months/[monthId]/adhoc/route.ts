import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { AdHocType, Category } from "@/generated/prisma/client";

// POST /api/months/[monthId]/adhoc
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ monthId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { monthId } = await params;
  const body = await req.json();

  const month = await db.month.findFirst({ where: { id: monthId, userId: session.user.id } });
  if (!month) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const item = await db.adHocItem.create({
    data: {
      monthId,
      name: body.name,
      amount: body.amount,
      type: body.type as AdHocType,
      category: body.category as Category | undefined,
      date: new Date(body.date),
      notes: body.notes,
    },
  });

  let updatedEntry: { id: string; amount: number; statementAmount: number | null } | null = null;

  if (body.type === "EXPENSE" && body.category === "CREDIT_CARD" && body.ccTemplateId) {
    const templateId: string = body.ccTemplateId;

    // Find or create the MonthlyEntry for this CC template in this month
    let entry = await db.monthlyEntry.findUnique({
      where: { monthId_templateId: { monthId, templateId } },
    });

    if (!entry) {
      const template = await db.lineItemTemplate.findFirst({
        where: { id: templateId, userId: session.user.id, category: "CREDIT_CARD" },
      });
      if (template) {
        entry = await db.monthlyEntry.create({
          data: { monthId, templateId, amount: template.amount, isPaid: false, statementAmount: 0 },
        });
      }
    }

    if (entry) {
      // Determine if charge is pre-close (belongs to current month's bill) or post-close (next month)
      const template = await db.lineItemTemplate.findUnique({ where: { id: templateId } });
      const statementDay = template?.statementDay ?? null;
      const expenseDay = new Date(body.date).getDate();
      const isPreClose = statementDay !== null && expenseDay <= statementDay;

      if (isPreClose) {
        // Add directly to current bill (entry.amount) — this month's liability
        updatedEntry = await db.monthlyEntry.update({
          where: { id: entry.id },
          data: { amount: entry.amount + body.amount },
          select: { id: true, amount: true, statementAmount: true },
        });
      } else {
        // Post-close: accumulate in statementAmount for next month's bill
        // Use explicit value (not Prisma increment) to avoid NULL + X = NULL in PostgreSQL
        updatedEntry = await db.monthlyEntry.update({
          where: { id: entry.id },
          data: { statementAmount: (entry.statementAmount ?? 0) + body.amount },
          select: { id: true, amount: true, statementAmount: true },
        });
      }
    }
  }

  return NextResponse.json({ item, updatedEntry }, { status: 201 });
}

// DELETE /api/months/[monthId]/adhoc?id=xxx
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ monthId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { monthId } = await params;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const item = await db.adHocItem.findFirst({
    where: { id, monthId, month: { userId: session.user.id } },
  });

  let updatedEntry: { id: string; amount: number; statementAmount: number | null } | null = null;

  if (item?.category === "CREDIT_CARD" && item.type === "EXPENSE") {
    // Parse card name from notes ("CardName · Subcategory") to find the right entry
    const cardName = item.notes?.split(" · ")[0] ?? null;
    const entry = await db.monthlyEntry.findFirst({
      where: {
        monthId,
        template: {
          category: "CREDIT_CARD",
          userId: session.user.id,
          ...(cardName ? { name: cardName } : {}),
        },
      },
      select: {
        id: true, amount: true, statementAmount: true,
        template: { select: { statementDay: true } },
      },
    });

    if (entry) {
      const statementDay = entry.template.statementDay ?? null;
      const expenseDay = new Date(item.date).getDate();
      const isPreClose = statementDay !== null && expenseDay <= statementDay;

      updatedEntry = await db.monthlyEntry.update({
        where: { id: entry.id },
        data: isPreClose
          ? { amount: Math.max(0, entry.amount - item.amount) }
          : { statementAmount: Math.max(0, (entry.statementAmount ?? 0) - item.amount) },
        select: { id: true, amount: true, statementAmount: true },
      });
    }
  }

  await db.adHocItem.deleteMany({
    where: { id, monthId, month: { userId: session.user.id } },
  });

  return NextResponse.json({ ok: true, updatedEntry });
}
