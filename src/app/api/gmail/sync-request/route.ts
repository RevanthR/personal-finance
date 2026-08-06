import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

// POST /api/gmail/sync-request — a user asks to be let into Gmail sync.
// Doesn't grant anything by itself: an admin still has to manually add the
// email as a test user in Google Cloud Console (Google's OAuth "Testing"
// mode won't let anyone else complete the consent screen at all, no matter
// what this app does) and then approve here — this just puts the request
// somewhere the admin can see it instead of the user hitting Google's own
// dead-end error with no way to ask for access.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { gmailSyncStatus: true },
  });
  if (user?.gmailSyncStatus !== "NONE") {
    return NextResponse.json({ error: "Request already pending or approved" }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id: session.user.id },
    data: { gmailSyncStatus: "REQUESTED", gmailSyncRequestedAt: new Date() },
    select: { gmailSyncStatus: true },
  });

  revalidatePath("/imports");
  return NextResponse.json(updated);
}
