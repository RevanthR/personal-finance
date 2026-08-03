import { db } from "@/lib/db";
import webpush from "web-push";

// Shared notification tags — same tag used by whoever first shows the
// notification and by whoever later updates/closes it, so they always
// target the same banner across every one of a user's devices.
export const GMAIL_SYNC_PUSH_TAG = "gmail-sync";
export const PAYMENT_REMINDER_PUSH_TAG = "payment-reminder";

export function initVapid() {
  const { VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (VAPID_SUBJECT && NEXT_PUBLIC_VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }
}

// A "notify" payload shows a banner — `tag` (optional) makes a later
// notification with the same tag replace this one in place on whichever
// device receives it, instead of stacking a second, stale copy. A "close"
// payload shows nothing; the service worker just closes any existing
// notification with that tag — used when the thing a notification was
// about got handled on a different device (see public/sw.js).
export type PushPayload =
  | { type?: "notify"; title: string; body: string; url?: string; tag?: string }
  | { type: "close"; tag: string };

// Sends one payload to every device a user has push-subscribed on, cleaning
// up subscriptions that have expired or been revoked. Best-effort: a
// failure sending to one device doesn't stop the others.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  initVapid();
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return 0;

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
      sent++;
    } catch {
      await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    }
  }
  return sent;
}

// Dismiss a notification across every device the user has, not just
// whichever one they're acting on — e.g. reviewing a synced transaction on
// the laptop shouldn't leave the same banner sitting on the phone.
export async function closePushForUser(userId: string, tag: string): Promise<number> {
  return sendPushToUser(userId, { type: "close", tag });
}
