import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate, zName, zDay } from "@/lib/validation";
import { revalidatePath } from "next/cache";

const CardPostSchema = z.object({
  name:         zName,
  bank:         z.string().trim().max(100).optional(),
  network:      z.enum(["Visa", "Mastercard", "Rupay", "Amex"]).optional(),
  last4:        z.string().trim().regex(/^\d{4}$/).optional(),
  statementDay: zDay.optional(),
  dueDateDay:   zDay.optional(),
});

// GET — list all CC cards for the user (with current month's entry if it exists)
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cards = await db.creditCard.findMany({
    where: { userId: session.user.id },
    include: {
      template: {
        select: {
          id: true, name: true, isActive: true,
          statementDay: true, dueDateDay: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(cards);
}

// POST — create a new CC card
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = validate(CardPostSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { name, bank, network, last4, statementDay, dueDateDay } = parsed.data;

  const template = await db.lineItemTemplate.create({
    data: {
      userId:       session.user.id,
      name,
      category:     "CREDIT_CARD",
      amount:       0,
      isFixed:      false,
      statementDay: statementDay ?? null,
      dueDateDay:   dueDateDay   ?? null,
    },
  });

  const card = await db.creditCard.create({
    data: {
      templateId: template.id,
      userId:     session.user.id,
      bank:       bank    ?? null,
      network:    network ?? null,
      last4:      last4   ?? null,
    },
    include: {
      template: {
        select: { id: true, name: true, isActive: true, statementDay: true, dueDateDay: true },
      },
    },
  });

  revalidatePath("/receivables");
  revalidatePath("/dashboard");
  return NextResponse.json(card, { status: 201 });
}
