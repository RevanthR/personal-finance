import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAccessAllowed } from "@/lib/plans";

export type ApiUser =
  | { ok: true; id: string; isAdmin: boolean }
  | { ok: false; response: NextResponse };

/**
 * The one auth check for API routes. Signed in, account active, and (unless
 * `allowExpired`) on a trial or paid plan, the same gate the app layout
 * applies to pages. Admins always pass the plan check. Routes a blocked user
 * still needs (billing, sign-out, settings basics) pass `allowExpired`.
 */
export async function requireApiUser(opts?: { allowExpired?: boolean }): Promise<ApiUser> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.isActive) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const isAdmin = u.role === "ADMIN";
  if (!opts?.allowExpired && !isAdmin && !isAccessAllowed({ trialEndsAt: u.trialEndsAt, planExpiry: u.planExpiry })) {
    return { ok: false, response: NextResponse.json({ error: "Your plan has expired" }, { status: 402 }) };
  }
  return { ok: true, id: u.id, isAdmin };
}
