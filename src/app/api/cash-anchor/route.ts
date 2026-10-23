import { requireApiUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, CashAnchorSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

// POST /api/cash-anchor — "on this date I actually have ₹X". Appends a new
// CashAnchor at now; every recorded event before now stops affecting the
// balance, so this zeroes any accumulated drift. See src/lib/cash-balance.ts.
export async function POST(req: NextRequest) {
  const me = await requireApiUser();
  if (!me.ok) return me.response;

  const parsed = validate(CashAnchorSchema, await req.json());
  if (!parsed.ok) return parsed.response;

  const anchor = await db.cashAnchor.create({
    data: { userId: me.id, balance: parsed.data.balance, asOf: new Date() },
  });

  revalidatePath("/dashboard");
  revalidatePath("/months");
  return NextResponse.json({ anchor });
}
