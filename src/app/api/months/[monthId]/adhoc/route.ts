import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { AdHocType, Category } from "@/generated/prisma/client";
import { validate, AdHocPostSchema } from "@/lib/validation";

// Recompute statementAmount for a CC card from ALL remaining post-close adHocItems.
// This is idempotent and self-healing regardless of past accumulation bugs.
async function recomputeStatementAmount(
  monthId: string,
  entryId: string,
  cardName: string | null,
  statementDay: number | null,
): Promise<{ id: string; amount: number; statementAmount: number | null }> {
  // Scope the query to this card's items only (notes start with "CardName · …")
  const cardItems = await db.adHocItem.findMany({
    where: {
      monthId,
      type: "EXPENSE",
      category: "CREDIT_CARD",
      ...(cardName ? { notes: { startsWith: `${cardName} ·` } } : {}),
    },
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
    select: { id: true, amount: true, statementAmount: true },
  });
}

// POST /api/months/[monthId]/adhoc
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ monthId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { monthId } = await params;

  const parsed = validate(AdHocPostSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

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
      notes: body.notes ?? null,
    },
  });

  let updatedEntry: { id: string; amount: number; statementAmount: number | null } | null = null;

  if (body.type === "EXPENSE" && body.category === "CREDIT_CARD" && body.ccTemplateId) {
    const templateId: string = body.ccTemplateId;

    let entry = await db.monthlyEntry.findUnique({
      where: { monthId_templateId: { monthId, templateId } },
    });

    if (!entry) {
      const template = await db.lineItemTemplate.findFirst({
        where: { id: templateId, userId: session.user.id, category: "CREDIT_CARD" },
      });
      if (template) {
        entry = await db.monthlyEntry.create({
          data: { monthId, templateId, amount: 0, billedAmount: 0, isPaid: false, statementAmount: 0 },
        });
      }
    }

    if (entry) {
      const template = await db.lineItemTemplate.findUnique({ where: { id: templateId } });
      const statementDay = template?.statementDay ?? null;
      const expenseDay = new Date(body.date).getDate();
      const isPreClose = statementDay !== null && expenseDay <= statementDay;
      const cardName = item.notes?.split(" · ")[0] ?? null;

      if (isPreClose) {
        updatedEntry = await db.monthlyEntry.update({
          where: { id: entry.id },
          data: {
            amount: entry.amount + body.amount,
            billedAmount: (entry.billedAmount ?? entry.amount) + body.amount,
          },
          select: { id: true, amount: true, statementAmount: true, billedAmount: true },
        });
      } else {
        updatedEntry = await recomputeStatementAmount(monthId, entry.id, cardName, statementDay);
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

  // Delete first, then recompute so the deleted item is excluded from the sum
  await db.adHocItem.deleteMany({
    where: { id, monthId, month: { userId: session.user.id } },
  });

  let updatedEntry: { id: string; amount: number; statementAmount: number | null } | null = null;

  if (item?.category === "CREDIT_CARD" && item.type === "EXPENSE") {
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
        id: true, amount: true, statementAmount: true, billedAmount: true,
        template: { select: { statementDay: true } },
      },
    });

    if (entry) {
      const statementDay = entry.template.statementDay ?? null;
      const expenseDay = new Date(item.date).getDate();
      const isPreClose = statementDay !== null && expenseDay <= statementDay;

      if (isPreClose) {
        const newAmount = Math.max(0, entry.amount - item.amount);
        updatedEntry = await db.monthlyEntry.update({
          where: { id: entry.id },
          data: {
            amount: newAmount,
            billedAmount: Math.max(0, (entry.billedAmount ?? entry.amount) - item.amount),
          },
          select: { id: true, amount: true, statementAmount: true, billedAmount: true },
        });
      } else {
        updatedEntry = await recomputeStatementAmount(monthId, entry.id, cardName, statementDay);
      }
    }
  }

  return NextResponse.json({ ok: true, updatedEntry });
}
