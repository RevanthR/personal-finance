import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { templateCacheTag } from "@/lib/cached-queries";
import { z } from "zod";
import { validate, zMoney, zDay, zMonth, zYear } from "@/lib/validation";

const ChitPatchSchema = z.object({
  isLifted:               z.boolean().optional(),
  liftedAmount:           zMoney.optional().nullable(),
  liftedUsedFor:          z.string().trim().max(200).optional().nullable(),
  monthlyLiftedAmount:    zMoney.optional().nullable(),
  monthlyUnliftedAmount:  zMoney.optional(),
  accumulatedSavings:     zMoney.optional(),
  totalValue:             zMoney.optional(),
  durationMonths:         z.number().int().min(1).max(120).optional(),
  startDate:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:                z.string().refine((s) => !isNaN(Date.parse(s)), { message: "Invalid date" }).optional().nullable(),
  liftMonth:              zMonth.optional(),
  liftYear:               zYear.optional(),
  dueDateDay:             zDay.optional().nullable(),
});

// PATCH — update chit (including lift action)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chitId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chitId } = await params;

  const parsed = validate(ChitPatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const chit = await db.chitFund.findFirst({
    where: { id: chitId, userId: session.user.id },
    include: { template: true },
  });
  if (!chit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isLifting = body.isLifted === true && !chit.isLifted;

  const updated = await db.chitFund.update({
    where: { id: chitId },
    data: {
      isLifted:               body.isLifted              ?? chit.isLifted,
      liftedOn:               isLifting ? new Date()     : chit.liftedOn,
      liftedAmount:           body.liftedAmount          ?? chit.liftedAmount,
      liftedUsedFor:          body.liftedUsedFor         ?? chit.liftedUsedFor,
      monthlyLiftedAmount:    body.monthlyLiftedAmount   ?? chit.monthlyLiftedAmount,
      monthlyUnliftedAmount:  body.monthlyUnliftedAmount ?? chit.monthlyUnliftedAmount,
      accumulatedSavings:     body.accumulatedSavings    ?? chit.accumulatedSavings,
      totalValue:             body.totalValue            ?? chit.totalValue,
      durationMonths:         body.durationMonths        ?? chit.durationMonths,
      startDate:              body.startDate ? new Date(body.startDate) : chit.startDate,
      endDate:                body.endDate !== undefined ? (body.endDate ? new Date(body.endDate) : null) : chit.endDate,
    },
    include: { template: true },
  });

  // On lift: create income in the selected month and schedule next-month payment increase
  if (isLifting) {
    const liftMonth = body.liftMonth ?? new Date().getMonth() + 1;
    const liftYear  = body.liftYear  ?? new Date().getFullYear();

    let monthRecord = await db.month.findUnique({
      where: { userId_month_year: { userId: session.user.id, month: liftMonth, year: liftYear } },
    });
    if (!monthRecord) {
      monthRecord = await db.month.create({
        data: { userId: session.user.id, month: liftMonth, year: liftYear, salaryIncome: 0 },
      });
    }

    await db.adHocItem.create({
      data: {
        monthId:  monthRecord.id,
        name:     `${chit.template.name} Chit Lifted`,
        amount:   body.liftedAmount ?? chit.totalValue,
        type:     "INCOME",
        category: "OTHER_INCOME",
        date:     new Date(liftYear, liftMonth - 1, 1),
      },
    });

    if (body.monthlyLiftedAmount) {
      const nextMonth = liftMonth === 12 ? 1 : liftMonth + 1;
      const nextYear  = liftMonth === 12 ? liftYear + 1 : liftYear;
      await db.lineItemTemplate.update({
        where: { id: chit.templateId },
        data: {
          pendingAmount:    body.monthlyLiftedAmount,
          pendingFromMonth: nextMonth,
          pendingFromYear:  nextYear,
        },
      });
    }

    revalidateTag(templateCacheTag, {});
  }

  return NextResponse.json(updated);
}
