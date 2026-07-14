import { db } from "@/lib/db";
import webpush from "web-push";

export function initVapid() {
  const { VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (VAPID_SUBJECT && NEXT_PUBLIC_VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }
}

export type PushPayload = { title: string; body: string; url?: string };

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
