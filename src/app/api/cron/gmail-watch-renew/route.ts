import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { startWatch } from "@/lib/gmail/watch";
import { syncGmailForUser } from "@/lib/gmail/sync";
import { sendPushToUser } from "@/lib/push";

// Leaves a 2-day buffer before Google's 7-day Testing-mode refresh-token
// cliff — enough for the user to notice and reconnect before sync
// actually breaks.
const REMINDER_AFTER_DAYS = 5;

// GET /api/cron/gmail-watch-renew — called daily by Vercel Cron.
// Three jobs piggyback on this one daily touchpoint over every connected
// user, rather than adding more cron routes/vercel.json entries:
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
// 3. A proactive "reconnect soon" push notification once a connection is
//    nearing the 7-day refresh-token expiry, so it's a planned 30-second
//    reconnect instead of a silent failure discovered days later.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await db.gmailConnection.findMany({
    select: { userId: true, connectedAt: true, reminderSentAt: true },
  });

  let renewed = 0;
  let failed = 0;
  let reconciled = 0;
  let reconcileFailed = 0;
  let reminded = 0;
  for (const { userId, connectedAt, reminderSentAt } of connections) {
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

    const daysSinceConnect = (Date.now() - connectedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceConnect >= REMINDER_AFTER_DAYS && !reminderSentAt) {
      try {
        await sendPushToUser(userId, {
          title: "Gmail sync needs reconnecting soon",
          body: "Your Gmail connection expires in a couple of days — reconnect to keep transactions syncing.",
          url: "/dashboard",
        });
        await db.gmailConnection.update({ where: { userId }, data: { reminderSentAt: new Date() } });
        reminded++;
      } catch (err) {
        console.error(`[gmail-watch-renew] reconnect reminder failed for user ${userId}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  return NextResponse.json({ total: connections.length, renewed, failed, reconciled, reconcileFailed, reminded });
}
