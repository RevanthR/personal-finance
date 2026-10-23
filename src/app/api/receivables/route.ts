import { requireApiUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, ReceivablePostSchema } from "@/lib/validation";
import { resolveCustomCategory } from "@/lib/custom-category";

export async function GET() {
  const me = await requireApiUser();
  if (!me.ok) return me.response;

  const receivables = await db.receivable.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(receivables);
}

export async function POST(req: NextRequest) {
  const me = await requireApiUser();
  if (!me.ok) return me.response;

  const parsed = validate(ReceivablePostSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Canonicalize against the same CustomCategory table ad-hoc items and
  // recurring templates use, instead of storing an unlinked free-text
  // string — "Kids" typed here now converges with "Kids" created anywhere
  // else in the app, case-insensitively.
  const customCat = body.customCategory ? await resolveCustomCategory(me.id, body.customCategory) : null;

  const receivable = await db.receivable.create({
    data: {
      userId: me.id,
      category: body.category,
      customCategory: customCat?.name ?? null,
      customCategoryId: customCat?.id ?? null,
      description: body.description,
      expectedAmount: body.expectedAmount,
      expectedDate: body.expectedDate ? new Date(body.expectedDate) : null,
    },
  });

  return NextResponse.json(receivable, { status: 201 });
}
