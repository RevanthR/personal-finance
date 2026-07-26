import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { reconcilePayment } from "@/lib/payments/reconcile";

// GET /api/cron/reconcile-payments — daily safety net for the payment
// capture gap: the client-side verify call (fired from inside Razorpay's
// checkout `handler` callback) is lost if the tab/PWA closes right after a
// successful payment, and the webhook is lost if its secret or registered
// URL is ever wrong. The /pricing page already reconciles a user's own stuck
// payments the moment they're blocked and land there; this sweeps anyone
// who never comes back, so a real payment never silently strands someone
// on FREE.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Lower bound: anything younger than 10 minutes might just be an
  // in-progress checkout, skip those so this doesn't race a legitimate
  // in-flight verify/webhook call. Upper bound: anything older than 48h was
  // either abandoned or already resolved — without this, every abandoned
  // checkout anyone has ever started stays on this list forever, so the
  // sweep's cost only grows with the app's lifetime instead of staying flat.
  const pending = await db.payment.findMany({
    where: {
      status: "CREATED",
      createdAt: { lt: new Date(Date.now() - 10 * 60 * 1000), gt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
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
