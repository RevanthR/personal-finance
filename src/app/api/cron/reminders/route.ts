import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { initVapid, sendPushToUser, PAYMENT_REMINDER_PUSH_TAG } from "@/lib/push";
import { actualDueDate } from "@/lib/finance-utils";
import { prevMonthYear } from "@/lib/utils";

export const maxDuration = 60;

// How many days ahead to warn, and how many days past due to keep nagging
// (after that the user knows; a daily banner forever is just noise).
const WARN_AHEAD_DAYS = 3;
const NAG_OVERDUE_DAYS = 10;

type DueItem = { userId: string; name: string; daysUntil: number };

// GET /api/cron/reminders — called daily by Vercel Cron
export async function GET(req: NextRequest) {
  // Fail closed: if CRON_SECRET is not configured, block all requests
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  initVapid();

  const now = new Date();
  // Compare on calendar days in UTC (the cron runs in UTC; stored
  // paymentDueDate values are UTC midnight).
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayMs = 86_400_000;
  const daysUntil = (year: number, month1: number, day: number) =>
    Math.round((Date.UTC(year, month1 - 1, day) - todayUtc) / dayMs);
  const inWindow = (d: number) => d <= WARN_AHEAD_DAYS && d >= -NAG_OVERDUE_DAYS;

  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();
  const { month: prevMonth, year: prevYear } = prevMonthYear(currentMonth, currentYear);
  const { month: prev2Month, year: prev2Year } = prevMonthYear(prevMonth, prevYear);

  // Recurring bills: unpaid entries with a due date, in a window of recent
  // months wide enough to catch a still-unpaid overdue one. actualDueDate
  // resolves the real calendar due date (a wrapping due day lands next month).
  const entryCandidates = await db.monthlyEntry.findMany({
    where: {
      isPaid: false,
      template: { dueDateDay: { not: null } },
      OR: [
        { month: { month: currentMonth, year: currentYear } },
        { month: { month: prevMonth, year: prevYear } },
        { month: { month: prev2Month, year: prev2Year } },
      ],
    },
    include: {
      template: { select: { name: true, dueDateDay: true, statementDay: true } },
      month: { select: { userId: true, month: true, year: true } },
    },
  });

  const items: DueItem[] = [];
  for (const e of entryCandidates) {
    const due = actualDueDate(e.month.month, e.month.year, e.template.statementDay, e.template.dueDateDay!);
    const d = daysUntil(due.year, due.month, due.day);
    if (inWindow(d)) items.push({ userId: e.month.userId, name: e.template.name, daysUntil: d });
  }

  // Credit-card bills live on CardStatement, with a real paymentDueDate.
  const ccStatements = await db.cardStatement.findMany({
    where: {
      paidInFull: false,
      paymentDueDate: {
        gte: new Date(todayUtc - NAG_OVERDUE_DAYS * dayMs),
        lte: new Date(todayUtc + WARN_AHEAD_DAYS * dayMs),
      },
    },
    select: {
      userId: true, statementBalance: true, paidAmount: true, cashback: true,
      paymentDueDate: true,
      card: { select: { template: { select: { name: true } } } },
    },
  });
  for (const s of ccStatements) {
    const owed = (s.statementBalance ?? 0) - s.paidAmount - s.cashback;
    if (owed <= 1) continue;
    const due = s.paymentDueDate;
    const d = daysUntil(due.getUTCFullYear(), due.getUTCMonth() + 1, due.getUTCDate());
    if (inWindow(d)) items.push({ userId: s.userId, name: s.card.template.name, daysUntil: d });
  }

  if (items.length === 0) return NextResponse.json({ sent: 0, skipped: "nothing due" });

  // One reminder per user, phrased by the most urgent item.
  const byUser = new Map<string, DueItem[]>();
  for (const it of items) {
    if (!byUser.has(it.userId)) byUser.set(it.userId, []);
    byUser.get(it.userId)!.push(it);
  }

  const sentCounts = await Promise.all([...byUser.entries()].map(async ([userId, userItems]) => {
    const overdue = userItems.filter(i => i.daysUntil < 0);
    const dueToday = userItems.filter(i => i.daysUntil === 0);
    const soon = userItems.filter(i => i.daysUntil > 0);
    const names = userItems.map(i => i.name);
    const nameList = `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2} more` : ""}`;

    let title: string;
    let body: string;
    if (overdue.length > 0) {
      title = overdue.length === 1 ? `${overdue[0].name} is overdue` : `${overdue.length} payments overdue`;
      body = `${nameList}. Pay and mark it done`;
    } else if (dueToday.length > 0) {
      title = dueToday.length === 1 ? `${dueToday[0].name} is due today` : `${dueToday.length} payments due today`;
      body = `${nameList}. Mark it paid once done`;
    } else {
      const nearest = Math.min(...soon.map(i => i.daysUntil));
      title = soon.length === 1
        ? `${soon[0].name} due in ${nearest} day${nearest === 1 ? "" : "s"}`
        : `${soon.length} payments due soon`;
      body = `${nameList}, due in ${nearest} day${nearest === 1 ? "" : "s"}`;
    }

    // Routed through sendPushToUser (not raw webpush) so it marks
    // PAYMENT_REMINDER_PUSH_TAG active — otherwise the close sent when a
    // bill gets paid would always see nothing to close and skip it.
    return sendPushToUser(userId, { title, body, url: "/dashboard", tag: PAYMENT_REMINDER_PUSH_TAG });
  }));

  return NextResponse.json({ sent: sentCounts.reduce((a, b) => a + b, 0), users: byUser.size });
}
