import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
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
