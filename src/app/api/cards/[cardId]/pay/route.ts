import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { validate, zMoney } from "@/lib/validation";
import { recordCardPayment, type CardPayment } from "@/lib/cards-db";
import { closePushForUser, PAYMENT_REMINDER_PUSH_TAG } from "@/lib/push";
import { revalidatePath } from "next/cache";

const Schema = z.object({
  full: z.boolean().optional(),
  amount: zMoney.optional(),
  unpay: z.boolean().optional(),
});

// POST /api/cards/[cardId]/pay: record a card payment. `full` clears
// everything owed (past-due statements first, then the latest); `amount`
// records a partial payment, oldest statement first; `unpay` reverses the
// latest statement's recorded payment. See recordCardPayment.
export async function POST(req: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const user = await requireApiUser();
  if (!user.ok) return user.response;

  const { cardId } = await params;
  const parsed = validate(Schema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { full, amount, unpay } = parsed.data;

  const payment: CardPayment = unpay ? { kind: "undo" } : full ? { kind: "full" } : { kind: "amount", amount: amount ?? 0 };
  const result = await recordCardPayment(user.id, cardId, payment);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  revalidatePath("/cards");
  revalidatePath("/dashboard");
  // Paying a card bill clears the "payment due" reminder on every device.
  if (!unpay) {
    await closePushForUser(user.id, PAYMENT_REMINDER_PUSH_TAG, "/dashboard").catch(() => {});
  }
  return NextResponse.json({ ok: true, stillOwed: result.stillOwed });
}
