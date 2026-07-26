import { db } from "@/lib/db";
import { capturePayment } from "./capture";

interface RazorpayPaymentEntity {
  id: string;
  status: string;
}

// Anything older than this was either abandoned (never actually paid) or
// already resolved one way or another. Bounding the window keeps this a
// small, fixed-cost check regardless of how many abandoned checkouts have
// accumulated over the app's lifetime — without it, every stray CREATED
// row anyone ever left behind gets re-queried against Razorpay forever.
const RECONCILE_WINDOW_MS = 48 * 60 * 60 * 1000; // 48h

// Both capture paths we normally rely on are best-effort: the client-side
// verify call fires from inside Razorpay's checkout `handler` callback, so
// it's lost if the tab/PWA is closed or backgrounded the instant a payment
// succeeds (common right after a UPI app-switch); the webhook is lost if
// its secret or registered URL is ever wrong. Asking Razorpay directly
// whether an order was actually paid closes that gap regardless of which
// of the two went missing.
export async function reconcilePayment(razorpayOrderId: string): Promise<boolean> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return false;

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}/payments`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return false;

  const data = await res.json() as { items: RazorpayPaymentEntity[] };
  const captured = data.items.find(p => p.status === "captured");
  if (!captured) return false;

  return capturePayment(razorpayOrderId, captured.id);
}

// Called opportunistically from the pricing page when a user who's blocked
// for lacking an active plan loads it — the moment that matters most to
// self-heal, since that's exactly where someone in Ajay's situation lands.
export async function reconcilePendingPaymentsForUser(userId: string): Promise<boolean> {
  const pending = await db.payment.findMany({
    where: { userId, status: "CREATED", createdAt: { gt: new Date(Date.now() - RECONCILE_WINDOW_MS) } },
  });
  let any = false;
  for (const payment of pending) {
    try {
      if (await reconcilePayment(payment.razorpayOrderId)) any = true;
    } catch (err) {
      console.error(`[reconcile-payments] lookup failed for order ${payment.razorpayOrderId}:`, err instanceof Error ? err.message : err);
    }
  }
  return any;
}
