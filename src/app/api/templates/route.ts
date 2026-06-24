import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { Category } from "@/generated/prisma/client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await db.lineItemTemplate.findMany({
    where: { userId: session.user.id },
    include: { chitFund: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const template = await db.lineItemTemplate.create({
    data: {
      userId: session.user.id,
      name: body.name,
      category: body.category as Category,
      amount: body.amount,
      isFixed: body.isFixed ?? true,
      dueDateDay: body.dueDateDay,
      sortOrder: body.sortOrder ?? 0,
    },
  });

  return NextResponse.json(template, { status: 201 });
}
