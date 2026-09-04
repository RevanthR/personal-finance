import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { startWatch } from "@/lib/gmail/watch";
import { syncGmailForUser } from "@/lib/gmail/sync";
import { sendPushToUser, GMAIL_RECONNECT_PUSH_TAG } from "@/lib/push";
import { runPool } from "@/lib/gmail/pool";

// Loops a full-scan reconciliation sync over every connected user. 60s is
// the Vercel Hobby ceiling.
export const maxDuration = 60;

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

  const stats = { renewed: 0, failed: 0, reconciled: 0, reconcileFailed: 0, reminded: 0 };

  // Process users a few at a time, not one-by-one — a sequential loop over
  // every connection (watch renewal + a full-scan sync + maybe a Gemini
  // call each) can blow past maxDuration and leave later users unprocessed.
  await runPool(connections, 3, async ({ userId, connectedAt, reminderSentAt }) => {
    const ok = await startWatch(userId);
    if (ok) stats.renewed++;
    else stats.failed++;

    try {
      await syncGmailForUser(userId, undefined, { forceFullScan: true, bypassLock: true });
      stats.reconciled++;
    } catch (err) {
      stats.reconcileFailed++;
      console.error(`[gmail-watch-renew] reconciliation sync failed for user ${userId}:`, err instanceof Error ? err.message : err);
    }

    const daysSinceConnect = (Date.now() - connectedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceConnect >= REMINDER_AFTER_DAYS && !reminderSentAt) {
      try {
        await sendPushToUser(userId, {
          title: "Gmail sync needs reconnecting soon",
          body: "Your Gmail connection expires in a couple of days. Reconnect to keep transactions syncing.",
          url: "/settings",
          tag: GMAIL_RECONNECT_PUSH_TAG,
        });
        await db.gmailConnection.update({ where: { userId }, data: { reminderSentAt: new Date() } });
        stats.reminded++;
      } catch (err) {
        console.error(`[gmail-watch-renew] reconnect reminder failed for user ${userId}:`, err instanceof Error ? err.message : err);
      }
    }
  });

  return NextResponse.json({ total: connections.length, ...stats });
}
