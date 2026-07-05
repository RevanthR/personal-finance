import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { templateCacheTag } from "@/lib/cached-queries";
import { z } from "zod";
import { validate, zMoney, zDay, zMonth, zYear } from "@/lib/validation";

const ChitPatchSchema = z.object({
  isLifted:             z.boolean().optional(),
  liftedAmount:         zMoney.optional(),
  monthlyLiftedAmount:  zMoney.optional().nullable(),
  monthlyUnliftedAmount: zMoney.optional(),
  totalValue:           zMoney.optional(),
  durationMonths:       z.number().int().min(1).max(120).optional(),
  startDate:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  liftMonth:            zMonth.optional(),
  liftYear:             zYear.optional(),
  dueDateDay:           zDay.optional().nullable(),
  name:                 z.string().trim().min(1).max(100).optional(),
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

  // Construct liftedOn from the user-selected month/year (first day of that month, UTC)
  let liftedOn = chit.liftedOn;
  if (isLifting || (body.liftMonth != null && body.liftYear != null)) {
    const m = body.liftMonth ?? (chit.liftedOn ? chit.liftedOn.getUTCMonth() + 1 : new Date().getMonth() + 1);
    const y = body.liftYear  ?? (chit.liftedOn ? chit.liftedOn.getUTCFullYear()  : new Date().getFullYear());
    liftedOn = new Date(Date.UTC(y, m - 1, 1));
  }

  const updated = await db.chitFund.update({
    where: { id: chitId },
    data: {
      isLifted:             body.isLifted            ?? chit.isLifted,
      liftedOn,
      liftedAmount:         body.liftedAmount        ?? chit.liftedAmount,
      monthlyLiftedAmount:  body.monthlyLiftedAmount  ?? chit.monthlyLiftedAmount,
      monthlyUnliftedAmount: body.monthlyUnliftedAmount ?? chit.monthlyUnliftedAmount,
      totalValue:           body.totalValue           ?? chit.totalValue,
      durationMonths:       body.durationMonths       ?? chit.durationMonths,
      startDate:            body.startDate ? new Date(body.startDate) : chit.startDate,
    },
    include: { template: true },
  });

  // Update template name and due date if provided
  if (body.name !== undefined || body.dueDateDay !== undefined) {
    await db.lineItemTemplate.update({
      where: { id: chit.templateId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.dueDateDay !== undefined && { dueDateDay: body.dueDateDay }),
      },
    });
  }

  const liftMonth = body.liftMonth ?? (chit.liftedOn ? chit.liftedOn.getUTCMonth() + 1 : new Date().getMonth() + 1);
  const liftYear  = body.liftYear  ?? (chit.liftedOn ? chit.liftedOn.getUTCFullYear()  : new Date().getFullYear());
  const incomeLabel = `${chit.template.name} Chit Lifted`;

  if (isLifting) {
    // Fresh lift: create pot-value income in the selected month
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
        name:     incomeLabel,
        amount:   body.liftedAmount ?? chit.totalValue,
        type:     "INCOME",
        category: "OTHER_INCOME",
        date:     new Date(Date.UTC(liftYear, liftMonth - 1, 1)),
      },
    });
    if (body.monthlyLiftedAmount) {
      const nextMonth = liftMonth === 12 ? 1 : liftMonth + 1;
      const nextYear  = liftMonth === 12 ? liftYear + 1 : liftYear;
      await db.lineItemTemplate.update({
        where: { id: chit.templateId },
        data: { pendingAmount: body.monthlyLiftedAmount, pendingFromMonth: nextMonth, pendingFromYear: nextYear },
      });
    }
  } else if (chit.isLifted && body.liftMonth != null && body.liftYear != null) {
    // Lift month edit on already-lifted chit: move income adhoc to the new month
    const allMonthIds = (await db.month.findMany({
      where: { userId: session.user.id },
      select: { id: true, month: true, year: true },
    }));
    const oldEntry = await db.adHocItem.findFirst({
      where: { name: incomeLabel, type: "INCOME", monthId: { in: allMonthIds.map(m => m.id) } },
    });
    if (oldEntry) {
      let newMonthRecord = allMonthIds.find(m => m.month === liftMonth && m.year === liftYear);
      if (!newMonthRecord) {
        const created = await db.month.create({
          data: { userId: session.user.id, month: liftMonth, year: liftYear, salaryIncome: 0 },
        });
        newMonthRecord = created;
      }
      await db.adHocItem.update({
        where: { id: oldEntry.id },
        data: { monthId: newMonthRecord.id, date: new Date(Date.UTC(liftYear, liftMonth - 1, 1)) },
      });
    }
  } else if (chit.isLifted && body.liftedAmount != null) {
    // Amount-only edit on already-lifted chit: update the income adhoc amount
    const allMonthIds = (await db.month.findMany({ where: { userId: session.user.id }, select: { id: true } }));
    await db.adHocItem.updateMany({
      where: { name: incomeLabel, type: "INCOME", monthId: { in: allMonthIds.map(m => m.id) } },
      data: { amount: body.liftedAmount },
    });
  }

  revalidateTag(templateCacheTag, {});
  revalidatePath("/dashboard");
  revalidatePath("/months");

  return NextResponse.json(updated);
}

// DELETE — remove a chit fund and all its entries
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ chitId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chitId } = await params;

  const chit = await db.chitFund.findFirst({
    where: { id: chitId, userId: session.user.id },
    select: { id: true, templateId: true, isLifted: true, template: { select: { name: true } } },
  });
  if (!chit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remove the lift income ad-hoc entry that was created when this chit was lifted.
  // Use a two-step approach (fetch monthIds first) because deleteMany with nested
  // relation filters doesn't work reliably with @prisma/adapter-pg.
  if (chit.isLifted) {
    const monthIds = (await db.month.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    })).map(m => m.id);
    await db.adHocItem.deleteMany({
      where: {
        name: `${chit.template.name} Chit Lifted`,
        type: "INCOME",
        monthId: { in: monthIds },
      },
    });
  }

  // Deleting the template cascades to ChitFund and MonthlyEntry (onDelete: Cascade in schema)
  await db.lineItemTemplate.delete({ where: { id: chit.templateId } });

  revalidateTag(templateCacheTag, {});
  revalidatePath("/dashboard");
  revalidatePath("/months");
  revalidatePath("/receivables");

  return NextResponse.json({ ok: true });
}
