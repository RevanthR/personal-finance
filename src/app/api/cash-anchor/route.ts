import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, CashAnchorSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

// POST /api/cash-anchor — "on this date I actually have ₹X". Appends a new
// CashAnchor at now; every recorded event before now stops affecting the
// balance, so this zeroes any accumulated drift. See src/lib/cash-balance.ts.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = validate(CashAnchorSchema, await req.json());
  if (!parsed.ok) return parsed.response;

  const anchor = await db.cashAnchor.create({
    data: { userId: session.user.id, balance: parsed.data.balance, asOf: new Date() },
  });

  revalidatePath("/dashboard");
  revalidatePath("/months");
  return NextResponse.json({ anchor });
}
