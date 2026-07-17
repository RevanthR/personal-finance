import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { Category, TemplateType } from "@/generated/prisma/client";
import { revalidateTag } from "next/cache";
import { templateCacheTag } from "@/lib/cached-queries";
import { validate, TemplatePostSchema } from "@/lib/validation";
import { resolveCustomCategory } from "@/lib/custom-category";
import { computeTemplateEntryAmount, computePrevCCState } from "@/lib/entry-amount";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await db.lineItemTemplate.findMany({
    where: { userId: session.user.id },
    include: { chitFund: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = validate(TemplatePostSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const isCustom = Boolean(body.customCategory);
  const customCat = isCustom ? await resolveCustomCategory(session.user.id, body.customCategory!) : null;
  const template = await db.lineItemTemplate.create({
    data: {
      userId: session.user.id,
      name: body.name,
      category: (isCustom ? "MISCELLANEOUS" : body.category) as Category,
      customCategory: customCat?.name ?? null,
      customCategoryId: customCat?.id ?? null,
      amount: body.amount,
      isFixed: body.isFixed ?? true,
      dueDateDay: body.dueDateDay ?? null,
      statementDay: body.statementDay ?? null,
      frequency: body.frequency ?? "MONTHLY",
      dueMonth: body.dueMonth ?? null,
      templateType: (body.templateType ?? "EXPENSE") as TemplateType,
      endsOnMonth: body.endsOnMonth ?? null,
      endsOnYear: body.endsOnYear ?? null,
      sortOrder: body.sortOrder ?? 0,
      loanOriginalPrincipal: body.loanOriginalPrincipal ?? null,
      loanInterestRate: body.loanInterestRate ?? null,
      loanRateType: body.loanRateType ?? null,
      loanStartDate: body.loanStartDate ? new Date(body.loanStartDate) : null,
      loanOutstandingOverride: body.loanOutstandingOverride ?? null,
    },
  });

  // If requested, inject an entry into the current already-populated month.
  // Uses the same amount computation as real month setup (computeTemplateEntryAmount)
  // rather than the raw template.amount, so a CREDIT_CARD template added
  // mid-month gets a correctly-derived opening balance instead of whatever
  // estimate the user typed into the template form.
  if (body.addToCurrentMonth && (body.templateType ?? "EXPENSE") !== "INCOME") {
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();
    const curMonthRecord = await db.month.findUnique({
      where: { userId_month_year: { userId: session.user.id, month: curMonth, year: curYear } },
    });
    if (curMonthRecord) {
      let prevCC: ReturnType<typeof computePrevCCState> | undefined;
      if (template.category === "CREDIT_CARD") {
        const prevMonthNum = curMonth === 1 ? 12 : curMonth - 1;
        const prevYear = curMonth === 1 ? curYear - 1 : curYear;
        const prevEntry = await db.monthlyEntry.findFirst({
          where: { templateId: template.id, month: { userId: session.user.id, month: prevMonthNum, year: prevYear } },
          select: { statementAmount: true, isPaid: true, amount: true, billedAmount: true, paidAmount: true, cashbackAmount: true },
        });
        prevCC = computePrevCCState(prevEntry);
      }
      const { amount, billedAmount } = computeTemplateEntryAmount(template, template.amount, prevCC);
      await db.monthlyEntry.upsert({
        where: { monthId_templateId: { monthId: curMonthRecord.id, templateId: template.id } },
        create: { monthId: curMonthRecord.id, templateId: template.id, amount, ...(billedAmount !== undefined && { billedAmount }) },
        update: {},
      });
    }
  }

  revalidateTag(templateCacheTag, {});
  return NextResponse.json(template, { status: 201 });
}
