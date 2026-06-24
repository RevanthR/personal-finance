import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";

function initVapid() {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (subject && publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }
}

// POST — save push subscription
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subscription, label } = await req.json();

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
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint } = await req.json();
  await db.pushSubscription.deleteMany({
    where: { endpoint, userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}

// POST /api/push/send — send reminders (called by cron or manually)
export async function PUT(req: NextRequest) {
  initVapid();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  let sent = 0;
  for (const sub of subs) {
    for (const entry of pendingEntries) {
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
        // Subscription expired — remove it
        await db.pushSubscription.delete({ where: { id: sub.id } });
      }
    }
  }

  return NextResponse.json({ sent });
}
