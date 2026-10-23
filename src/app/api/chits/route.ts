import { requireApiUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getCurrentMonthYear } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { validate, ChitPostSchema } from "@/lib/validation";
import { revalidateTag, revalidatePath } from "next/cache";
import { templateCacheTag } from "@/lib/cached-queries";

export async function GET() {
  const me = await requireApiUser();
  if (!me.ok) return me.response;

  const chits = await db.chitFund.findMany({
    where: { userId: me.id },
    include: { template: true },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json(chits);
}

export async function POST(req: NextRequest) {
  const me = await requireApiUser();
  if (!me.ok) return me.response;

  const parsed = validate(ChitPostSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const template = await db.lineItemTemplate.create({
    data: {
      userId: me.id,
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
      userId:               me.id,
      totalValue:           body.totalValue,
      durationMonths:       body.durationMonths,
      startDate:            new Date(body.startDate),
      monthlyUnliftedAmount: body.monthlyUnliftedAmount,
      monthlyLiftedAmount:  body.monthlyLiftedAmount ?? null,
      endDate:              body.endDate ? new Date(body.endDate) : null,
    },
    include: { template: true },
  });

  // Inject entry into any already-populated month that falls within the chit's active range
  const startDate = new Date(body.startDate);
  const startM = startDate.getUTCMonth() + 1;
  const startY = startDate.getUTCFullYear();
  const { month: nowM, year: nowY } = getCurrentMonthYear();

  // Only inject for months from startDate up to and including current month
  if (startY < nowY || (startY === nowY && startM <= nowM)) {
    const months = await db.month.findMany({
      where: {
        userId: me.id,
        isPopulated: true,
        OR: [
          { year: { gt: startY } },
          { year: startY, month: { gte: startM } },
        ],
      },
      select: { id: true, month: true, year: true },
    });

    for (const m of months) {
      const isPast = m.year < nowY || (m.year === nowY && m.month <= nowM);
      if (!isPast) continue;
      await db.monthlyEntry.upsert({
        where: { monthId_templateId: { monthId: m.id, templateId: template.id } },
        create: { monthId: m.id, templateId: template.id, amount: body.monthlyUnliftedAmount },
        update: {},
      });
    }
  }

  revalidateTag(templateCacheTag, {});
  revalidatePath("/dashboard");
  revalidatePath("/months");
  return NextResponse.json(chit, { status: 201 });
}
