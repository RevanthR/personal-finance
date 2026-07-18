import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { initVapid } from "@/lib/push";
import { validate, PushSubscribeSchema, PushUnsubscribeSchema } from "@/lib/validation";

// POST — save push subscription
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = validate(PushSubscribeSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { subscription, label } = parsed.data;

  // `endpoint` is only unique per browser registration, not per user — on a
  // shared device, a second person subscribing with the same endpoint
  // previously kept the row owned by whoever created it first (update never
  // touched userId), silently leaving reminders addressed to the wrong
  // account routed to this device. Reassigning userId on every (re)subscribe
  // makes ownership match whoever is actually authenticated right now.
  await db.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId: session.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      label,
    },
    update: {
      userId: session.user.id,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      label,
    },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — remove subscription
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = validate(PushUnsubscribeSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { endpoint } = parsed.data;
  await db.pushSubscription.deleteMany({
    where: { endpoint, userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}

// POST /api/push/send — send reminders (called by cron or manually)
export async function PUT(req: NextRequest) {
  initVapid();
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().getDate();

  // Find entries due today or overdue that aren't paid
  const pendingEntries = await db.monthlyEntry.findMany({
    where: {
      month: { userId: session.user.id },
      isPaid: false,
      template: { dueDateDay: today },
    },
    include: { template: true },
  });

  if (pendingEntries.length === 0) return NextResponse.json({ sent: 0 });

  const subs = await db.pushSubscription.findMany({ where: { userId: session.user.id } });

  // Track dead subscriptions instead of deleting inline on the first
  // failure — the old code deleted immediately, then kept retrying (and
  // re-deleting an already-deleted row) for every remaining entry against
  // the same now-confirmed-dead subscription, throwing an unhandled P2025
  // on the second delete. One deleteMany at the end, guarded like
  // src/lib/push.ts's sendPushToUser does.
  let sent = 0;
  const deadSubIds = new Set<string>();
  for (const sub of subs) {
    for (const entry of pendingEntries) {
      if (deadSubIds.has(sub.id)) break;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: `Payment Due Today`,
            body: `${entry.template.name} is due today`,
            url: "/dashboard",
          })
        );
        sent++;
      } catch {
        // Subscription expired — mark for removal
        deadSubIds.add(sub.id);
      }
    }
  }
  if (deadSubIds.size > 0) {
    await db.pushSubscription.deleteMany({ where: { id: { in: [...deadSubIds] } } }).catch(() => {});
  }

  return NextResponse.json({ sent });
}
