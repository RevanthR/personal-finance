import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getOAuthClient, GMAIL_SCOPES } from "@/lib/gmail/client";
import crypto from "crypto";

// GET /api/gmail/connect — redirects to Google's consent screen asking for
// read-only Gmail access. Kept separate from the main sign-in provider
// (src/lib/auth.ts) so this sensitive scope is only ever requested from
// users who explicitly opt in here, not at every login.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const oauth2Client = getOAuthClient();
  const state = crypto.randomBytes(16).toString("hex");
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
  });

  const res = NextResponse.redirect(url);
  res.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
