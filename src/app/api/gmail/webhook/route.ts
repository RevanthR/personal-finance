import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { syncGmailForUser } from "@/lib/gmail/sync";

interface PubSubPushBody {
  message?: { data?: string };
}

// POST /api/gmail/webhook — Pub/Sub push endpoint. Google calls this the
// moment a watched mailbox changes. Must respond fast (Pub/Sub retries,
// and can eventually disable the subscription, if this hangs or 5xxs), so
// the actual sync runs in the background via after() once we've already
// returned 200.
export async function POST(req: NextRequest) {
  const secret = process.env.GMAIL_WEBHOOK_SECRET;
  if (!secret || req.nextUrl.searchParams.get("token") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PubSubPushBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const dataB64 = body.message?.data;
  if (!dataB64) return NextResponse.json({ ok: true });

  let emailAddress: string | undefined;
  try {
    const decoded = JSON.parse(Buffer.from(dataB64, "base64").toString("utf-8"));
    emailAddress = decoded.emailAddress;
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (!emailAddress) return NextResponse.json({ ok: true });

  const conn = await db.gmailConnection.findFirst({
    where: { email: emailAddress },
    select: { userId: true },
  });

  if (conn) {
    after(async () => {
      try {
        await syncGmailForUser(conn.userId);
      } catch (err) {
        console.error(`[gmail-webhook] background sync failed for user ${conn.userId}:`, err instanceof Error ? err.message : err);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
