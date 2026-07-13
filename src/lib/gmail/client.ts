import { google } from "googleapis";
import { db } from "@/lib/db";

// gmail.modify (superset of readonly — read + label/trash, still no send)
// is required for users.watch() to succeed: Google's Gmail API rejects
// that call with a 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT under gmail.readonly
// alone, despite docs suggesting readonly should be enough. Confirmed
// directly against the live API. Nothing in this app's code performs any
// write/modify action, this scope is requested solely to satisfy watch().
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
    `${process.env.NEXTAUTH_URL}/api/gmail/callback`,
  );
}

// Returns a Gmail API client for a user's stored connection, or null if
// they haven't connected one. Persists refreshed access tokens back to the
// DB via the OAuth2Client's "tokens" event so callers don't have to.
export async function getGmailClientForUser(userId: string) {
  const conn = await db.gmailConnection.findUnique({ where: { userId } });
  if (!conn) return null;

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    access_token: conn.accessToken,
    refresh_token: conn.refreshToken,
    expiry_date: conn.tokenExpiry.getTime(),
  });

  oauth2Client.on("tokens", (tokens) => {
    if (!tokens.access_token) return;
    void db.gmailConnection.update({
      where: { userId },
      data: {
        accessToken: tokens.access_token,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : conn.tokenExpiry,
      },
    });
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}
