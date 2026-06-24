import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

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

  const body = await req.json();

  // Create the template first, then the chit fund record
  const template = await db.lineItemTemplate.create({
    data: {
      userId: session.user.id,
      name: body.name,
      category: "CHIT_FUND",
      amount: body.monthlyUnliftedAmount,
      isFixed: true,
      dueDateDay: body.dueDateDay,
      sortOrder: body.sortOrder ?? 50,
    },
  });

  const chit = await db.chitFund.create({
    data: {
      templateId: template.id,
      userId: session.user.id,
      totalValue: body.totalValue,
      durationMonths: body.durationMonths,
      startDate: new Date(body.startDate),
      monthlyUnliftedAmount: body.monthlyUnliftedAmount,
      monthlyLiftedAmount: body.monthlyLiftedAmount,
      endDate: body.endDate ? new Date(body.endDate) : null,
    },
    include: { template: true },
  });

  return NextResponse.json(chit, { status: 201 });
}
