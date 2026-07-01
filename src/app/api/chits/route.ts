import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, ChitPostSchema } from "@/lib/validation";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chits = await db.chitFund.findMany({
    where: { userId: session.user.id },
    include: { template: true },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json(chits);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = validate(ChitPostSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const template = await db.lineItemTemplate.create({
    data: {
      userId: session.user.id,
      name: body.name,
      category: "CHIT_FUND",
      amount: body.monthlyUnliftedAmount,
      isFixed: true,
      dueDateDay: body.dueDateDay ?? null,
      sortOrder: body.sortOrder ?? 50,
    },
  });

  const chit = await db.chitFund.create({
    data: {
      templateId:           template.id,
      userId:               session.user.id,
      totalValue:           body.totalValue,
      durationMonths:       body.durationMonths,
      startDate:            new Date(body.startDate),
      monthlyUnliftedAmount: body.monthlyUnliftedAmount,
      monthlyLiftedAmount:  body.monthlyLiftedAmount ?? null,
      endDate:              body.endDate ? new Date(body.endDate) : null,
    },
    include: { template: true },
  });

  return NextResponse.json(chit, { status: 201 });
}
