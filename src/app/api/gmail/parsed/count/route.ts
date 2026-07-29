import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/gmail/parsed/count — the sidebar's live badge poll target. A
// single indexed count query, matching the layout's getImportsBadge exactly
// (all PENDING, including likely-duplicates) — unlike /api/gmail/parsed's
// countOnly mode, which still runs the full match-finding pipeline first
// and counts a different (unmatched-only) subset.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const count = await db.parsedTransaction.count({ where: { userId: session.user.id, status: "PENDING" } });
  return NextResponse.json({ count });
}
