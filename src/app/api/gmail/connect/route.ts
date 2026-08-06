import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, GMAIL_SCOPES } from "@/lib/gmail/client";
import crypto from "crypto";

// GET /api/gmail/connect — redirects to Google's consent screen asking for
// read-only Gmail access. Kept separate from the main sign-in provider
// (src/lib/auth.ts) so this sensitive scope is only ever requested from
// users who explicitly opt in here, not at every login.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Belt-and-suspenders: the UI already hides this button until approved,
  // but Google's own OAuth "Testing" gate is the real enforcement — this
  // just avoids sending a not-yet-approved user into that dead-end error
  // page at all, redirecting them back with an explanation instead.
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { gmailSyncStatus: true } });
  if (user?.gmailSyncStatus !== "APPROVED") {
    return NextResponse.redirect(new URL("/imports?gmailError=not_approved", req.url));
  }

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
