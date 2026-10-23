import { requireApiUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, UserSettingsSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

// PATCH /api/user — per-user preferences (currently just payDay, the day
// salary lands, used to date income for the real-time cash balance).
export async function PATCH(req: NextRequest) {
  const me = await requireApiUser();
  if (!me.ok) return me.response;

  const parsed = validate(UserSettingsSchema, await req.json());
  if (!parsed.ok) return parsed.response;

  const user = await db.user.update({
    where: { id: me.id },
    data: parsed.data,
    select: { payDay: true },
  });

  revalidatePath("/dashboard");
  revalidatePath("/months");
  revalidatePath("/settings");
  return NextResponse.json({ user });
}
