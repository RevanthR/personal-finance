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

  const updated = await db.lineItemTemplate.updateMany({
    where: { id: templateId, userId: session.user.id },
    data: {
      name: body.name,
      category: body.category as Category,
      amount: body.amount,
      isFixed: body.isFixed,
      dueDateDay: body.dueDateDay,
      isActive: body.isActive,
      sortOrder: body.sortOrder,
    },
  });

  return NextResponse.json(updated);
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
