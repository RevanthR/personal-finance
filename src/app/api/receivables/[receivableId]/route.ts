import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, ReceivablePatchSchema } from "@/lib/validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ receivableId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { receivableId } = await params;

  const parsed = validate(ReceivablePatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const receivable = await db.receivable.findFirst({
    where: { id: receivableId, userId: session.user.id },
  });
  if (!receivable) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isMarkingReceived = body.status === "RECEIVED" && receivable.status !== "RECEIVED";

  const updated = await db.receivable.update({
    where: { id: receivableId },
    data: {
      status:          body.status          ?? receivable.status,
      receivedAmount:  body.receivedAmount  ?? receivable.receivedAmount,
      receivedDate:    body.receivedDate    ? new Date(body.receivedDate) : receivable.receivedDate,
      receivedMonthId: body.receivedMonthId ?? receivable.receivedMonthId,
      description:     body.description     ?? receivable.description,
      expectedAmount:  body.expectedAmount  ?? receivable.expectedAmount,
      expectedDate:    body.expectedDate !== undefined
        ? (body.expectedDate ? new Date(body.expectedDate) : null)
        : receivable.expectedDate,
      category:        body.category        ?? receivable.category,
      customCategory:  body.customCategory !== undefined ? body.customCategory : receivable.customCategory,
    },
  });

  // Create income AdHocItem when marking as received
  if (isMarkingReceived && body.receivedMonth != null && body.receivedYear != null) {
    const recMonth = body.receivedMonth;
    const recYear  = body.receivedYear;
    const amount   = body.receivedAmount ?? receivable.expectedAmount;

    let monthRecord = await db.month.findUnique({
      where: { userId_month_year: { userId: session.user.id, month: recMonth, year: recYear } },
    });
    if (!monthRecord) {
      monthRecord = await db.month.create({
        data: { userId: session.user.id, month: recMonth, year: recYear, salaryIncome: 0 },
      });
    }

    await db.adHocItem.create({
      data: {
        monthId: monthRecord.id,
        name: receivable.description,
        amount,
        type: "INCOME",
        category: "OTHER_INCOME",
        date: new Date(recYear, recMonth - 1, 1),
      },
    });

    await db.receivable.update({
      where: { id: receivableId },
      data: { receivedMonthId: monthRecord.id },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ receivableId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { receivableId } = await params;

  const receivable = await db.receivable.findFirst({
    where: { id: receivableId, userId: session.user.id },
  });
  if (!receivable) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.receivable.delete({ where: { id: receivableId } });
  return NextResponse.json({ ok: true });
}
