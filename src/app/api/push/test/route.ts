import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import webpush from "web-push";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) {
    return NextResponse.json({ error: "VAPID keys not configured" }, { status: 500 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const subs = await db.pushSubscription.findMany({
    where: { userId: session.user.id },
  });

  if (subs.length === 0) {
    return NextResponse.json({ error: "No subscriptions found. Enable notifications in Settings first." }, { status: 400 });
  }

  const messages = [
    { title: "FinanceOS ✓", body: "Push notifications are working!", url: "/dashboard" },
    { title: "Reminder", body: "Your June salary entry is pending.", url: "/dashboard" },
  ];

  let sent = 0;
  for (const sub of subs) {
    for (const msg of messages) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(msg)
        );
        sent++;
        // Small delay so they arrive as separate notifications
        await new Promise(r => setTimeout(r, 800));
      } catch {
        await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  }

  return NextResponse.json({ sent, subscriptions: subs.length });
}
