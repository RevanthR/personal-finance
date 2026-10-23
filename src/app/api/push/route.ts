import { requireApiUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { validate, PushSubscribeSchema, PushUnsubscribeSchema } from "@/lib/validation";

// POST — save push subscription
export async function POST(req: NextRequest) {
  const me = await requireApiUser();
  if (!me.ok) return me.response;

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
      userId: me.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      label,
    },
    update: {
      userId: me.id,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      label,
    },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — remove subscription
export async function DELETE(req: NextRequest) {
  const me = await requireApiUser();
  if (!me.ok) return me.response;

  const parsed = validate(PushUnsubscribeSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { endpoint } = parsed.data;
  await db.pushSubscription.deleteMany({
    where: { endpoint, userId: me.id },
  });

  return NextResponse.json({ ok: true });
}
