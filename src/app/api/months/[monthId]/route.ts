import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

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
  const body = await req.json();

  const updated = await db.month.updateMany({
    where: { id: monthId, userId: session.user.id },
    data: {
      ...(body.salaryIncome  !== undefined && { salaryIncome:  Number(body.salaryIncome)  }),
      ...(body.freelanceIncome !== undefined && { freelanceIncome: Number(body.freelanceIncome) }),
      ...(body.otherIncome   !== undefined && { otherIncome:   Number(body.otherIncome)   }),
    },
  });

  if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
