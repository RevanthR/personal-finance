import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate, zMoney } from "@/lib/validation";
import { getCurrentMonthYear } from "@/lib/utils";
import { revalidatePath } from "next/cache";

const SetBillSchema = z.object({
  templateId:   z.string().cuid(),
  amount:       zMoney.optional(),
  billedAmount: zMoney.optional(),
  isPaid:       z.boolean().optional(),
});

// POST — upsert a CC entry for the current month (create or update)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const parsed = validate(SetBillSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { templateId, amount, billedAmount, isPaid } = parsed.data;

  // Verify template belongs to user and is a CC
  const template = await db.lineItemTemplate.findFirst({
    where: { id: templateId, userId },
  });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (template.category !== "CREDIT_CARD") return NextResponse.json({ error: "Not a CC template" }, { status: 400 });

  // Get or create the current month
  const { month, year } = getCurrentMonthYear();
  const monthRecord = await db.month.upsert({
    where: { userId_month_year: { userId, month, year } },
    create: { userId, month, year },
    update: {},
    select: { id: true },
  });

  const entryAmount = amount ?? billedAmount ?? 0;
  const entry = await db.monthlyEntry.upsert({
    where: { monthId_templateId: { monthId: monthRecord.id, templateId } },
    create: {
      monthId: monthRecord.id,
      templateId,
      amount: entryAmount,
      billedAmount: billedAmount ?? entryAmount,
      ...(isPaid !== undefined && { isPaid }),
    },
    update: {
      ...(amount       !== undefined && { amount }),
      ...(billedAmount !== undefined && { billedAmount }),
      ...(isPaid       !== undefined && { isPaid, ...(isPaid && { paidOn: new Date() }) }),
    },
    select: {
      id: true, templateId: true,
      amount: true, billedAmount: true,
      isPaid: true, paidAmount: true, cashbackAmount: true,
      statementAmount: true,
    },
  });

  revalidatePath("/receivables");
  revalidatePath("/dashboard");
  return NextResponse.json(entry);
}
