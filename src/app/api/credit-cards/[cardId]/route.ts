import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate, zName, zDay } from "@/lib/validation";
import { revalidatePath } from "next/cache";

const CardPatchSchema = z.object({
  name:         zName.optional(),
  bank:         z.string().trim().max(100).nullable().optional(),
  network:      z.enum(["Visa", "Mastercard", "Rupay", "Amex"]).nullable().optional(),
  last4:        z.string().trim().regex(/^\d{4}$/).nullable().optional(),
  statementDay: zDay.nullable().optional(),
  dueDateDay:   zDay.nullable().optional(),
  isActive:     z.boolean().optional(),
});

// PATCH — update card metadata
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cardId } = await params;

  const card = await db.creditCard.findFirst({
    where: { id: cardId, userId: session.user.id },
    include: { template: true },
  });
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = validate(CardPatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { name, bank, network, last4, statementDay, dueDateDay, isActive } = parsed.data;

  // Update template fields (name, statementDay, dueDateDay, isActive)
  if (name !== undefined || statementDay !== undefined || dueDateDay !== undefined || isActive !== undefined) {
    await db.lineItemTemplate.update({
      where: { id: card.templateId },
      data: {
        ...(name         !== undefined && { name }),
        ...(statementDay !== undefined && { statementDay }),
        ...(dueDateDay   !== undefined && { dueDateDay }),
        ...(isActive     !== undefined && { isActive }),
      },
    });
  }

  const updated = await db.creditCard.update({
    where: { id: cardId },
    data: {
      ...(bank    !== undefined && { bank:    bank    ?? null }),
      ...(network !== undefined && { network: network ?? null }),
      ...(last4   !== undefined && { last4:   last4   ?? null }),
    },
    include: {
      template: {
        select: { id: true, name: true, isActive: true, statementDay: true, dueDateDay: true },
      },
    },
  });

  revalidatePath("/receivables");
  revalidatePath("/dashboard");
  return NextResponse.json(updated);
}

// DELETE — deactivate (soft-delete) a CC card
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cardId } = await params;

  const card = await db.creditCard.findFirst({
    where: { id: cardId, userId: session.user.id },
  });
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.lineItemTemplate.update({
    where: { id: card.templateId },
    data: { isActive: false },
  });

  revalidatePath("/receivables");
  return NextResponse.json({ ok: true });
}
