import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { Category, TemplateType } from "@/generated/prisma/client";

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

  const isCustom = Boolean(body.customCategory);
  const template = await db.lineItemTemplate.create({
    data: {
      userId: session.user.id,
      name: body.name,
      category: (isCustom ? "MISCELLANEOUS" : body.category) as Category,
      customCategory: isCustom ? body.customCategory : null,
      amount: body.amount,
      isFixed: body.isFixed ?? true,
      dueDateDay: body.dueDateDay,
      statementDay: body.statementDay ?? null,
      frequency: body.frequency ?? "MONTHLY",
      dueMonth: body.dueMonth ?? null,
      templateType: (body.templateType ?? "EXPENSE") as TemplateType,
      sortOrder: body.sortOrder ?? 0,
    },
  });

  return NextResponse.json(template, { status: 201 });
}
