import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { syncGmailForUser } from "@/lib/gmail/sync";

// POST /api/gmail/sync — triggered by the "Sync now" button. Streams
// newline-delimited JSON progress events instead of a single blocking
// response, since a full batch (up to 25 emails, one Gemini call each) can
// take well over a minute — the client renders this as a progress bar.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const result = await syncGmailForUser(userId, (processed, total) => {
          send({ type: "progress", processed, total });
        });
        if (result.error) send({ type: "error", error: result.error });
        else send({ type: "done", ...result });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Sync failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
