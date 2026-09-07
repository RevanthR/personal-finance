import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, UserSettingsSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

// PATCH /api/user — per-user preferences (currently just payDay, the day
// salary lands, used to date income for the real-time cash balance).
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = validate(UserSettingsSchema, await req.json());
  if (!parsed.ok) return parsed.response;

  const user = await db.user.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: { payDay: true },
  });

  revalidatePath("/dashboard");
  revalidatePath("/months");
  revalidatePath("/settings");
  return NextResponse.json({ user });
}
