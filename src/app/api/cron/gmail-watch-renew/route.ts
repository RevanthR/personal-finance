import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { startWatch } from "@/lib/gmail/watch";

// GET /api/cron/gmail-watch-renew — called daily by Vercel Cron.
// Gmail watch() subscriptions expire after at most 7 days; renewing daily
// keeps a comfortable multi-day margin regardless of exact timing.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await db.gmailConnection.findMany({ select: { userId: true } });

  let renewed = 0;
  let failed = 0;
  for (const { userId } of connections) {
    const ok = await startWatch(userId);
    if (ok) renewed++;
    else failed++;
  }

  return NextResponse.json({ total: connections.length, renewed, failed });
}
