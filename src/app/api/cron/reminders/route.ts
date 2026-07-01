import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";

function initVapid() {
  const { VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (VAPID_SUBJECT && NEXT_PUBLIC_VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }
}

// GET /api/cron/reminders — called daily by Vercel Cron
export async function GET(req: NextRequest) {
  // Fail closed: if CRON_SECRET is not configured, block all requests
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  initVapid();

  const now = new Date();
  const todayDay = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const rawTarget = todayDay + 3;

  // If rawTarget overflows (e.g. July 30 + 3 = 33), the due date is in the next month.
  // We still match against entries in the CURRENT month since the entry belongs here;
  // only the due date itself falls in the next month (common for CC bills).
  const targetDay = rawTarget > daysInMonth ? rawTarget - daysInMonth : rawTarget;

  // Find all unpaid entries due in 3 days across all users who have push subscriptions
  const entries = await db.monthlyEntry.findMany({
    where: {
      isPaid: false,
      month: { month: currentMonth, year: currentYear },
      template: { dueDateDay: targetDay },
    },
    include: {
      template: { select: { name: true, dueDateDay: true } },
      month: { select: { userId: true } },
    },
  });

  if (entries.length === 0) return NextResponse.json({ sent: 0, skipped: "no due entries" });

  // Group entries by userId
  const byUser = new Map<string, typeof entries>();
  for (const e of entries) {
    const uid = e.month.userId;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(e);
  }

  // Fetch subscriptions for relevant users
  const userIds = [...byUser.keys()];
  const subs = await db.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  let sent = 0;
  const expiredIds: string[] = [];

  for (const [userId, userEntries] of byUser) {
    const userSubs = subs.filter(s => s.userId === userId);
    if (userSubs.length === 0) continue;

    const names = userEntries.map(e => e.template.name);
    const dueDay = userEntries[0].template.dueDateDay!;

    const payload = JSON.stringify({
      title: names.length === 1
        ? `${names[0]} due in 3 days`
        : `${names.length} payments due in 3 days`,
      body: names.length === 1
        ? `Due on the ${dueDay}th — mark it paid once done`
        : `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2} more` : ""} — due on the ${dueDay}th`,
      url: "/dashboard",
    });

    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch {
        expiredIds.push(sub.id);
      }
    }
  }

  // Clean up expired subscriptions
  if (expiredIds.length > 0) {
    await db.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
  }

  return NextResponse.json({ sent, expiredRemoved: expiredIds.length });
}
