import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/gmail/client";
import { startWatch } from "@/lib/gmail/watch";
import { google } from "googleapis";

// GET /api/gmail/callback — Google redirects here after consent.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.redirect(new URL("/login", req.url));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("gmail_oauth_state")?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/settings?gmail=error", req.url));
  }

  const oauth2Client = getOAuthClient();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token || !tokens.access_token || !tokens.expiry_date) {
      return NextResponse.redirect(new URL("/settings?gmail=error", req.url));
    }

    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userinfo } = await oauth2.userinfo.get();

    // connectedAt/needsReauth/reminderSentAt are set explicitly on BOTH
    // branches, not left to the schema's create-only @default(now()) —
    // this route doesn't require disconnecting first, so a user can land
    // on the `update` branch (a connection row already exists) while still
    // getting a genuinely fresh refresh token from Google. The reconnect
    // reminder's timing depends on connectedAt being accurate regardless
    // of which branch ran.
    const freshConnection = {
      email: userinfo.email ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(tokens.expiry_date),
      connectedAt: new Date(),
      needsReauth: false,
      reminderSentAt: null,
    };
    await db.gmailConnection.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...freshConnection },
      update: freshConnection,
    });
  } catch {
    return NextResponse.redirect(new URL("/settings?gmail=error", req.url));
  }

  // Best-effort and non-fatal (a failure here, e.g. GMAIL_PUBSUB_TOPIC not
  // configured yet, must not block the connection itself) — but must be
  // awaited: on Vercel's serverless runtime, an un-awaited "fire and forget"
  // call can get frozen mid-flight the moment the response below is sent,
  // before the Gmail watch() call and its DB write ever complete.
  try {
    await startWatch(session.user.id);
  } catch {
    // startWatch() already logs its own errors — nothing further to do.
  }

  const res = NextResponse.redirect(new URL("/settings?gmail=connected", req.url));
  res.cookies.delete("gmail_oauth_state");
  return res;
}
