import { requireApiUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, ReceivablePatchSchema } from "@/lib/validation";
import { resolveCustomCategory } from "@/lib/custom-category";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ receivableId: string }> }
) {
  const me = await requireApiUser();
  if (!me.ok) return me.response;

  const { receivableId } = await params;

  const parsed = validate(ReceivablePatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const receivable = await db.receivable.findFirst({
    where: { id: receivableId, userId: me.id },
  });
  if (!receivable) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isMarkingReceived = body.status === "RECEIVED" && receivable.status !== "RECEIVED";

  // Canonicalize against the shared CustomCategory table instead of storing
  // an unlinked free-text string — same reasoning as POST above.
  const customCat = body.customCategory !== undefined
    ? (body.customCategory ? await resolveCustomCategory(me.id, body.customCategory) : null)
    : undefined; // undefined = leave as-is

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
      ...(customCat !== undefined && {
        customCategory: customCat?.name ?? null,
        customCategoryId: customCat?.id ?? null,
      }),
    },
  });

  // Create income AdHocItem when marking as received — same transaction as
  // the receivedMonthId follow-up update, so a failure between the two
  // can't leave the income recorded without the receivable pointing at it
  // (or vice versa).
  if (isMarkingReceived && body.receivedMonth != null && body.receivedYear != null) {
    const recMonth = body.receivedMonth;
    const recYear  = body.receivedYear;
    const amount   = body.receivedAmount ?? receivable.expectedAmount;

    let monthRecord = await db.month.findUnique({
      where: { userId_month_year: { userId: me.id, month: recMonth, year: recYear } },
    });
    if (!monthRecord) {
      monthRecord = await db.month.create({
        data: { userId: me.id, month: recMonth, year: recYear, salaryIncome: 0 },
      });
    }
    const monthId = monthRecord.id;

    await db.$transaction(async (tx) => {
      await tx.adHocItem.create({
        data: {
          monthId,
          name: receivable.description,
          amount,
          type: "INCOME",
          category: "OTHER_INCOME",
          date: new Date(recYear, recMonth - 1, 1),
        },
      });
      await tx.receivable.update({
        where: { id: receivableId },
        data: { receivedMonthId: monthId },
      });
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ receivableId: string }> }
) {
  const me = await requireApiUser();
  if (!me.ok) return me.response;

  const { receivableId } = await params;

  const receivable = await db.receivable.findFirst({
    where: { id: receivableId, userId: me.id },
  });
  if (!receivable) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.receivable.delete({ where: { id: receivableId } });
  return NextResponse.json({ ok: true });
}
