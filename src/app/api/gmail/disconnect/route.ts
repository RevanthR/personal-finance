import { requireApiUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/gmail/client";
import { stopWatch } from "@/lib/gmail/watch";

// DELETE /api/gmail/disconnect
export async function DELETE() {
  const me = await requireApiUser();
  if (!me.ok) return me.response;

  const conn = await db.gmailConnection.findUnique({ where: { userId: me.id } });
  if (conn) {
    await stopWatch(me.id);
    try {
      const oauth2Client = getOAuthClient();
      await oauth2Client.revokeToken(conn.refreshToken);
    } catch {
      // Best-effort revoke with Google — still remove the local record either way.
    }
    await db.gmailConnection.delete({ where: { userId: me.id } });
  }

  return NextResponse.json({ ok: true });
}
