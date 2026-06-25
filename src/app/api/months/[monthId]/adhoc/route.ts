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

  // CC expense → increment statementAmount on the linked CC entry so next month's bill auto-fills
  if (body.type === "EXPENSE" && body.category === "CREDIT_CARD" && body.ccEntryId) {
    await db.monthlyEntry.updateMany({
      where: { id: body.ccEntryId, monthId, month: { userId: session.user.id } },
      data: { statementAmount: { increment: body.amount } },
    });
  }

  return NextResponse.json(item, { status: 201 });
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

  // If this was a CC expense, decrement statementAmount before deleting
  const item = await db.adHocItem.findFirst({
    where: { id, monthId, month: { userId: session.user.id } },
  });
  if (item?.category === "CREDIT_CARD" && item.type === "EXPENSE") {
    const ccEntry = await db.monthlyEntry.findFirst({
      where: { monthId, template: { category: "CREDIT_CARD", userId: session.user.id } },
    });
    if (ccEntry) {
      await db.monthlyEntry.update({
        where: { id: ccEntry.id },
        data: { statementAmount: { decrement: item.amount } },
      });
    }
  }

  await db.adHocItem.deleteMany({
    where: { id, monthId, month: { userId: session.user.id } },
  });

  return NextResponse.json({ ok: true });
}
