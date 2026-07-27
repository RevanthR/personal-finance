import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, MonthPostSchema } from "@/lib/validation";
import { setupMonth } from "@/lib/months/setup-month";

// GET /api/months — list all months for current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const months = await db.month.findMany({
    where: { userId: session.user.id },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: {
      _count: { select: { entries: true, adHocItems: true } },
    },
  });

  return NextResponse.json(months);
}

// POST /api/months — create or get current month, auto-populate entries
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = validate(MonthPostSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { month, year, salaryIncome } = parsed.data;

  const monthRecord = await setupMonth(session.user.id, month, year, salaryIncome);
  return NextResponse.json(monthRecord);
}
