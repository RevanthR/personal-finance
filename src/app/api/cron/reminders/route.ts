import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { initVapid, PAYMENT_REMINDER_PUSH_TAG } from "@/lib/push";
import { actualDueDate } from "@/lib/finance-utils";
import { prevMonthYear } from "@/lib/utils";

// GET /api/cron/reminders — called daily by Vercel Cron
export async function GET(req: NextRequest) {
  // Fail closed: if CRON_SECRET is not configured, block all requests
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  initVapid();

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const target = new Date(now);
  target.setDate(target.getDate() + 3);
  const targetDay = target.getDate();
  const targetMonth = target.getMonth() + 1;
  const targetYear = target.getFullYear();

  // A Payment Due Date is just a day-of-month number with no month
  // attached — when it's earlier than the Bill Generation Date, it
  // actually falls in the month AFTER whichever month the entry itself
  // belongs to (bill generates the 15th, due the 5th — that's next
  // month's 5th). So the entry that's really due in 3 days could belong to
  // THIS month or LAST month, depending on where in the month today is —
  // scan both and let actualDueDate (the same rule the dashboard's own
  // card display and the overdue flag use) decide which ones actually
  // match the target date exactly.
  const { month: prevMonth, year: prevYear } = prevMonthYear(currentMonth, currentYear);

  const candidates = await db.monthlyEntry.findMany({
    where: {
      isPaid: false,
      template: { dueDateDay: { not: null } },
      OR: [
        { month: { month: currentMonth, year: currentYear } },
        { month: { month: prevMonth, year: prevYear } },
      ],
    },
    include: {
      template: { select: { name: true, dueDateDay: true, statementDay: true } },
      month: { select: { userId: true, month: true, year: true } },
    },
  });

  const entries = candidates.filter(e => {
    const due = actualDueDate(e.month.month, e.month.year, e.template.statementDay, e.template.dueDateDay!);
    return due.year === targetYear && due.month === targetMonth && due.day === targetDay;
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
        ? `Due on the ${dueDay}th, mark it paid once done`
        : `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2} more` : ""}, due on the ${dueDay}th`,
      url: "/dashboard",
      // Marking any of today's due bills paid (src/app/api/months/[monthId]/
      // entries/route.ts) closes this on every device — same tag.
      tag: PAYMENT_REMINDER_PUSH_TAG,
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
