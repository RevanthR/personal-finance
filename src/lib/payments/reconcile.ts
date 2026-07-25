import { db } from "@/lib/db";
import { capturePayment } from "./capture";

interface RazorpayPaymentEntity {
  id: string;
  status: string;
}

// Both capture paths we normally rely on are best-effort: the client-side
// verify call fires from inside Razorpay's checkout `handler` callback, so
// it's lost if the tab/PWA is closed or backgrounded the instant a payment
// succeeds (common right after a UPI app-switch); the webhook is lost if its
// secret or registered URL is ever wrong. Asking Razorpay directly whether
// an order was actually paid closes that gap regardless of which of the two
// went missing.
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

// Called opportunistically whenever a user with a stranded CREATED payment
// is about to be turned away at the access gate, so the fix lands the next
// time they open the app instead of waiting for the daily cron sweep.
export async function reconcilePendingPaymentsForUser(userId: string): Promise<boolean> {
  const pending = await db.payment.findMany({ where: { userId, status: "CREATED" } });
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
