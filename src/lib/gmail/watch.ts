import { db } from "@/lib/db";
import { getGmailClientForUser } from "./client";

// Registers (or renews) a push subscription: Gmail will publish a
// notification to GMAIL_PUBSUB_TOPIC every time this mailbox changes,
// instead of the app having to poll. Subscriptions expire after at most
// 7 days, so this needs to be called again before then (see the renewal
// cron) — calling it again while still active just extends it.
export async function startWatch(userId: string): Promise<boolean> {
  const topicName = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topicName) return false;

  const gmail = await getGmailClientForUser(userId);
  if (!gmail) return false;

  try {
    const { data } = await gmail.users.watch({
      userId: "me",
      requestBody: { topicName, labelIds: ["INBOX"] },
    });

    await db.gmailConnection.update({
      where: { userId },
      data: {
        historyId: data.historyId ?? null,
        watchExpiration: data.expiration ? new Date(Number(data.expiration)) : null,
      },
    });
    return true;
  } catch (err) {
    console.error(`[gmail-watch] startWatch failed for user ${userId}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

// Best-effort: mirrors the token-revoke pattern in disconnect/route.ts —
// failure here shouldn't block disconnecting the account locally.
export async function stopWatch(userId: string): Promise<void> {
  const gmail = await getGmailClientForUser(userId);
  if (!gmail) return;

  try {
    await gmail.users.stop({ userId: "me" });
  } catch {
    // Nothing to do — the watch will simply expire on its own within 7 days.
  }
}
