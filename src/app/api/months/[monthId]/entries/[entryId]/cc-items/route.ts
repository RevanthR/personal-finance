import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ monthId: string; entryId: string }> };

// Recompute and persist statementAmount from all CCLineItems
async function syncStatementAmount(entryId: string) {
  const items = await db.cCLineItem.findMany({ where: { entryId } });
  const total = items.reduce((s, i) => s + i.amount, 0);
  await db.monthlyEntry.update({
    where: { id: entryId },
    data: { statementAmount: total > 0 ? total : null },
  });
  return total > 0 ? total : null;
}

// POST — add a line item
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { monthId, entryId } = await params;
  const body = await req.json();

  // Verify ownership
  const entry = await db.monthlyEntry.findFirst({
    where: { id: entryId, monthId, month: { userId: session.user.id } },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const item = await db.cCLineItem.create({
    data: {
      entryId,
      name: String(body.name).trim(),
      amount: Number(body.amount),
      category: body.category ? String(body.category).trim() : null,
      date: body.date ? new Date(body.date) : null,
    },
  });

  const statementAmount = await syncStatementAmount(entryId);
  return NextResponse.json({ item, statementAmount });
}

// DELETE — remove a line item
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { monthId, entryId } = await params;
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("id");
  if (!itemId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Verify ownership
  const entry = await db.monthlyEntry.findFirst({
    where: { id: entryId, monthId, month: { userId: session.user.id } },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.cCLineItem.deleteMany({ where: { id: itemId, entryId } });

  const statementAmount = await syncStatementAmount(entryId);
  return NextResponse.json({ statementAmount });
}
