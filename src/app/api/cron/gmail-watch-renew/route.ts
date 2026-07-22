import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { startWatch } from "@/lib/gmail/watch";
import { syncGmailForUser } from "@/lib/gmail/sync";

// GET /api/cron/gmail-watch-renew — called daily by Vercel Cron.
// Two jobs piggyback on this one daily touchpoint over every connected
// user, rather than adding a second cron route/vercel.json entry:
//
// 1. Renew the Gmail watch() subscription — expires after at most 7 days,
//    renewing daily keeps a comfortable multi-day margin regardless of
//    exact timing.
// 2. A full-scan reconciliation sync (forceFullScan) — a self-healing
//    backstop for the incremental history-based sync (push-triggered or
//    manual), which depends on Gmail push notifications firing reliably.
//    A dropped Pub/Sub delivery, a mid-run crash, or any other gap in that
//    path should surface within a day, not silently forever. Cheap to run
//    daily: GmailSeenMessage dedup means anything already processed is
//    skipped before any Gmail body fetch or Gemini call.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await db.gmailConnection.findMany({ select: { userId: true } });

  let renewed = 0;
  let failed = 0;
  let reconciled = 0;
  let reconcileFailed = 0;
  for (const { userId } of connections) {
    const ok = await startWatch(userId);
    if (ok) renewed++;
    else failed++;

    try {
      await syncGmailForUser(userId, undefined, { forceFullScan: true });
      reconciled++;
    } catch (err) {
      reconcileFailed++;
      console.error(`[gmail-watch-renew] reconciliation sync failed for user ${userId}:`, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ total: connections.length, renewed, failed, reconciled, reconcileFailed });
}
