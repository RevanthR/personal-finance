import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, AdminPatchSchema } from "@/lib/validation";

function isNotAdmin(role?: string) {
  return role !== "ADMIN";
}

const SAFE_USER_FIELDS = {
  id: true, name: true, email: true, image: true,
  role: true, isActive: true, createdAt: true,
  planType: true, planExpiry: true, trialEndsAt: true,
  _count: { select: { months: true } },
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive || isNotAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: SAFE_USER_FIELDS,
  });

  return NextResponse.json(users);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive || isNotAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = validate(AdminPatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { userId, role, isActive } = parsed.data;

  // Prevent admin from locking themselves out
  if (userId === session.user.id && isActive === false) {
    return NextResponse.json({ error: "Cannot deactivate your own account" }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      ...(role     !== undefined && { role }),
      ...(isActive !== undefined && { isActive }),
    },
    select: SAFE_USER_FIELDS,
  });

  return NextResponse.json(updated);
}
