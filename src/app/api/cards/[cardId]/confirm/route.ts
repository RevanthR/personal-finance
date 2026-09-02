import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate, zMoney } from "@/lib/validation";
import { ensureCurrentStatement } from "@/lib/cards-db";
import { revalidatePath } from "next/cache";

const Schema = z.object({ statementBalance: zMoney });

// POST /api/cards/[cardId]/confirm — record the real statement balance for
// the cycle that most recently closed. Once set, cardStatus() takes this
// figure as authoritative and never recomputes it from charges.
export async function POST(req: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { cardId } = await params;
  const parsed = validate(Schema, await req.json());
  if (!parsed.ok) return parsed.response;

  const card = await db.creditCard.findFirst({
    where: { id: cardId, userId },
    select: { id: true, userId: true, template: { select: { statementDay: true, dueDateDay: true } } },
  });
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (card.template.statementDay == null) {
    return NextResponse.json({ error: "Set a statement date on this card first" }, { status: 400 });
  }

  const row = await db.$transaction(async (tx) => {
    const stmt = await ensureCurrentStatement(tx, {
      id: card.id, userId: card.userId,
      statementDay: card.template.statementDay, dueDateDay: card.template.dueDateDay,
    });
    if (!stmt) throw new Error("no cycle to confirm");
    return tx.cardStatement.update({
      where: { id: stmt.id },
      data: { statementBalance: parsed.data.statementBalance, confirmedAt: new Date(), confirmedVia: "manual" },
    });
  });

  revalidatePath("/cards");
  revalidatePath("/dashboard");
  return NextResponse.json({ statement: row });
}
