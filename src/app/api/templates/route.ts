import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { Category, TemplateType } from "@/generated/prisma/client";
import { revalidateTag } from "next/cache";
import { templateCacheTag } from "@/lib/cached-queries";
import { validate, TemplatePostSchema } from "@/lib/validation";
import { resolveCustomCategory } from "@/lib/custom-category";

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

  // If requested, inject an entry into the current already-populated month
  if (body.addToCurrentMonth && (body.templateType ?? "EXPENSE") !== "INCOME") {
    const now = new Date();
    const curMonth = await db.month.findUnique({
      where: { userId_month_year: { userId: session.user.id, month: now.getMonth() + 1, year: now.getFullYear() } },
    });
    if (curMonth) {
      await db.monthlyEntry.upsert({
        where: { monthId_templateId: { monthId: curMonth.id, templateId: template.id } },
        create: { monthId: curMonth.id, templateId: template.id, amount: template.amount },
        update: {},
      });
    }
  }

  revalidateTag(templateCacheTag, {});
  return NextResponse.json(template, { status: 201 });
}
