import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { reconcilePayment } from "@/lib/payments/reconcile";

// GET /api/cron/reconcile-payments — daily safety net for the payment
// capture gap: the client-side verify call (fired from inside Razorpay's
// checkout `handler` callback) is lost if the tab/PWA closes right after a
// successful payment, and the webhook is lost if its secret or registered
// URL is ever wrong. The (app) layout already reconciles a user's own stuck
// payments the moment they're blocked and reopen the app; this sweeps
// anyone who never comes back, so a real payment never silently strands
// someone on FREE.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Anything younger than 10 minutes might just be an in-progress checkout,
  // skip those so this doesn't race a legitimate in-flight verify/webhook call.
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const pending = await db.payment.findMany({
    where: { status: "CREATED", createdAt: { lt: cutoff } },
  });

  let reconciled = 0;
  let failed = 0;
  for (const payment of pending) {
    try {
      if (await reconcilePayment(payment.razorpayOrderId)) reconciled++;
    } catch (err) {
      failed++;
      console.error(`[reconcile-payments] failed for order ${payment.razorpayOrderId}:`, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ total: pending.length, reconciled, failed });
}
