import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { syncGmailForUser } from "@/lib/gmail/sync";

// POST /api/gmail/sync — triggered by the "Sync now" button in Settings.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await syncGmailForUser(session.user.id);
    if (result.error) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
