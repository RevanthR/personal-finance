import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, MonthPatchSchema } from "@/lib/validation";

// GET /api/months/[monthId] — full month detail with entries
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ monthId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { monthId } = await params;

  const month = await db.month.findFirst({
    where: { id: monthId, userId: session.user.id },
    include: {
      entries: {
        include: { template: { include: { chitFund: true } } },
        orderBy: { template: { sortOrder: "asc" } },
      },
      adHocItems: { orderBy: { date: "asc" } },
    },
  });

  if (!month) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(month);
}

// PATCH /api/months/[monthId] — update income fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ monthId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { monthId } = await params;

  const parsed = validate(MonthPatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { salaryIncome, freelanceIncome, otherIncome } = parsed.data;

  const updated = await db.month.updateMany({
    where: { id: monthId, userId: session.user.id },
    data: {
      ...(salaryIncome    !== undefined && { salaryIncome }),
      ...(freelanceIncome !== undefined && { freelanceIncome }),
      ...(otherIncome     !== undefined && { otherIncome }),
    },
  });

  if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
