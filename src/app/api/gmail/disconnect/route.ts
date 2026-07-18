import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/gmail/client";
import { stopWatch } from "@/lib/gmail/watch";

// DELETE /api/gmail/disconnect
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conn = await db.gmailConnection.findUnique({ where: { userId: session.user.id } });
  if (conn) {
    await stopWatch(session.user.id);
    try {
      const oauth2Client = getOAuthClient();
      await oauth2Client.revokeToken(conn.refreshToken);
    } catch {
      // Best-effort revoke with Google — still remove the local record either way.
    }
    await db.gmailConnection.delete({ where: { userId: session.user.id } });
  }

  return NextResponse.json({ ok: true });
}
