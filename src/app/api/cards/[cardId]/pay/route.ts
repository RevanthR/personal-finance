import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate, zMoney } from "@/lib/validation";
import { ensureCurrentStatement, getCardsOverview } from "@/lib/cards-db";
import { revalidatePath } from "next/cache";

const Schema = z.object({
  full: z.boolean().optional(),
  amount: zMoney.optional(),
  unpay: z.boolean().optional(),
});

// POST /api/cards/[cardId]/pay — record a payment against the most recently
// closed statement. `full` settles whatever is still owed; `amount` records
// a partial payment; `unpay` clears it back to unpaid.
export async function POST(req: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { cardId } = await params;
  const parsed = validate(Schema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { full, amount, unpay } = parsed.data;

  const card = await db.creditCard.findFirst({
    where: { id: cardId, userId },
    select: { id: true, userId: true, template: { select: { statementDay: true, dueDateDay: true } } },
  });
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (card.template.statementDay == null) {
    return NextResponse.json({ error: "Set a statement date on this card first" }, { status: 400 });
  }

  // status.statementBalance is what's still owed after prior payments and
  // cashback; statementGross is the full figure. Both from the one function.
  const overview = (await getCardsOverview(userId)).find(c => c.cardId === cardId);
  const remaining = overview?.status.statementBalance ?? 0;
  const gross = overview?.status.statementGross ?? 0;

  const row = await db.$transaction(async (tx) => {
    const stmt = await ensureCurrentStatement(tx, {
      id: card.id, userId: card.userId,
      statementDay: card.template.statementDay, dueDateDay: card.template.dueDateDay,
    });
    if (!stmt) throw new Error("no cycle to pay");

    if (unpay) {
      return tx.cardStatement.update({ where: { id: stmt.id }, data: { paidAmount: 0, paidInFull: false } });
    }
    if (full) {
      return tx.cardStatement.update({
        where: { id: stmt.id },
        data: { paidAmount: stmt.paidAmount + remaining, paidInFull: true },
      });
    }
    const newPaid = stmt.paidAmount + (amount ?? 0);
    return tx.cardStatement.update({
      where: { id: stmt.id },
      data: { paidAmount: newPaid, paidInFull: newPaid + stmt.cashback >= gross - 0.5 },
    });
  });

  revalidatePath("/cards");
  revalidatePath("/dashboard");
  return NextResponse.json({ statement: row });
}
