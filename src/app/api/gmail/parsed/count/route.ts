import { requireApiUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/gmail/parsed/count — the sidebar's live badge poll target. A
// single indexed count query, matching the layout's getImportsBadge exactly
// (all PENDING, including likely-duplicates) — unlike /api/gmail/parsed's
// countOnly mode, which still runs the full match-finding pipeline first
// and counts a different (unmatched-only) subset.
export async function GET() {
  const me = await requireApiUser();
  if (!me.ok) return me.response;

  const count = await db.parsedTransaction.count({ where: { userId: me.id, status: "PENDING" } });
  return NextResponse.json({ count });
}
