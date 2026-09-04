import { db } from "@/lib/db";
import webpush from "web-push";

// Shared notification tags — same tag used by whoever first shows the
// notification and by whoever later updates/closes it, so they always
// target the same banner across every one of a user's devices.
export const GMAIL_SYNC_PUSH_TAG = "gmail-sync";
export const PAYMENT_REMINDER_PUSH_TAG = "payment-reminder";
export const GMAIL_RECONNECT_PUSH_TAG = "gmail-reconnect";

let warnedMissingVapid = false;

export function initVapid() {
  const { VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (VAPID_SUBJECT && NEXT_PUBLIC_VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    return;
  }
  // Missing any one of these makes every push silently no-op. Surface it
  // once per process instead of leaving "notifications just don't work"
  // with nothing in the logs.
  if (!warnedMissingVapid) {
    warnedMissingVapid = true;
    const missing = [
      !VAPID_SUBJECT && "VAPID_SUBJECT",
      !NEXT_PUBLIC_VAPID_PUBLIC_KEY && "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
      !VAPID_PRIVATE_KEY && "VAPID_PRIVATE_KEY",
    ].filter(Boolean);
    console.error(`[push] VAPID not configured, all push notifications disabled. Missing: ${missing.join(", ")}`);
  }
}

// web-push rejects with a statusCode on the error. 404/410 mean the
// subscription is permanently gone (unsubscribed, browser data cleared);
// anything else (429, 5xx, network) is transient and must NOT delete the
// row — doing so silently unsubscribes a live device on one bad response.
function isDeadSubscription(err: unknown): boolean {
  const code = (err as { statusCode?: number })?.statusCode;
  return code === 404 || code === 410;
}

// A "notify" payload shows a banner — `tag` (optional) makes a later
// notification with the same tag replace this one in place on whichever
// device receives it, instead of stacking a second, stale copy. A "close"
// payload shows nothing; the service worker closes any existing
// notification matching `tag` OR `url` — used when the thing a
// notification was about got handled on a different device (see
// public/sw.js). `url` matters as a fallback because a notification shown
// before tagging existed has no tag to match, only its original url.
export type PushPayload =
  | { type?: "notify"; title: string; body: string; url?: string; tag?: string }
  | { type: "close"; tag?: string; url?: string };

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
    } catch (err) {
      if (isDeadSubscription(err)) {
        await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        console.error(`[push] transient send failure for sub ${sub.id} (kept):`, (err as { statusCode?: number })?.statusCode ?? err);
      }
    }
  }

  // Track which tags currently have a notification showing, so a later
  // close can tell whether it actually has anything to do (see
  // closePushForUser) instead of firing a needless silent-then-flash push.
  if (sent > 0 && payload.type !== "close" && payload.tag) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { activePushTags: true } });
    if (user && !user.activePushTags.includes(payload.tag)) {
      await db.user.update({
        where: { id: userId },
        data: { activePushTags: { push: payload.tag } },
      }).catch(() => {});
    }
  }

  return sent;
}

// Dismiss a notification across every device the user has, not just
// whichever one they're acting on — e.g. reviewing a synced transaction on
// the laptop shouldn't leave the same banner sitting on the phone. Pass
// `url` too when closing a tag that's only just started being set (catches
// anything already showing from before the tag existed).
//
// Skips sending anything when this tag has no notification currently
// showing — every close still has to satisfy the browser's "every push is
// visible" rule with a brief placeholder flash (see public/sw.js), so
// firing one when there's nothing to close is a needless flash for no
// reason, not just a wasted request.
export async function closePushForUser(userId: string, tag: string, url?: string): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { activePushTags: true } });
  if (!user?.activePushTags.includes(tag)) return 0;

  await db.user.update({
    where: { id: userId },
    data: { activePushTags: user.activePushTags.filter((t) => t !== tag) },
  }).catch(() => {});

  return sendPushToUser(userId, { type: "close", tag, url });
}
