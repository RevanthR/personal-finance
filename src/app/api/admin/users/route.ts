import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@/generated/prisma/client";

function requireAdmin(role?: string) {
  return role !== "ADMIN";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || requireAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { months: true } } },
  });

  return NextResponse.json(users);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || requireAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, role, isActive } = await req.json();

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      role: role as Role | undefined,
      isActive: isActive ?? undefined,
    },
  });

  return NextResponse.json(updated);
}
