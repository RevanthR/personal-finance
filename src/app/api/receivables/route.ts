import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, ReceivablePostSchema } from "@/lib/validation";
import { resolveCustomCategory } from "@/lib/custom-category";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const receivables = await db.receivable.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(receivables);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = validate(ReceivablePostSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Canonicalize against the same CustomCategory table ad-hoc items and
  // recurring templates use, instead of storing an unlinked free-text
  // string — "Kids" typed here now converges with "Kids" created anywhere
  // else in the app, case-insensitively.
  const customCat = body.customCategory ? await resolveCustomCategory(session.user.id, body.customCategory) : null;

  const receivable = await db.receivable.create({
    data: {
      userId: session.user.id,
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
