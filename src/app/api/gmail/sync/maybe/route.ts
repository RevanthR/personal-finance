import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { syncGmailForUser } from "@/lib/gmail/sync";

const STALE_MS = 4 * 60 * 60 * 1000;

// POST /api/gmail/sync/maybe — cheap, safe to call on every app load. Only
// actually syncs if connected and the last sync is stale (or has never
// run), approximating "every 4 hours" without a paid Vercel Cron tier.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const conn = await db.gmailConnection.findUnique({ where: { userId }, select: { lastSyncAt: true } });
  if (!conn) return NextResponse.json({ ran: false, reason: "not connected" });

  const stale = !conn.lastSyncAt || Date.now() - conn.lastSyncAt.getTime() > STALE_MS;
  if (!stale) return NextResponse.json({ ran: false, reason: "recent" });

  try {
    const result = await syncGmailForUser(userId);
    return NextResponse.json({ ran: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ran: false, error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
