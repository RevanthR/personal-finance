import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { AdHocType, Category } from "@/generated/prisma/client";

// POST /api/months/[monthId]/adhoc — add ad-hoc income or expense
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ monthId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { monthId } = await params;
  const body = await req.json();

  const month = await db.month.findFirst({
    where: { id: monthId, userId: session.user.id },
  });
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

  await db.adHocItem.deleteMany({
    where: { id, monthId, month: { userId: session.user.id } },
  });

  return NextResponse.json({ ok: true });
}
