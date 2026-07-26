import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { capturePayment } from "@/lib/payments/capture";
import { safeEqual } from "@/lib/payments/signature";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] RAZORPAY_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(body)
    .digest("hex");

  if (!safeEqual(expected, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // The webhook is now subscribed to all event types (not just the two
  // handled below), so a body shape we don't recognise is expected traffic,
  // not an error — parse defensively and no-op on anything unhandled
  // instead of throwing.
  let event: { event: string; payload?: { payment?: { entity?: { order_id: string; id: string } } } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  if (event.event === "payment.captured" && event.payload?.payment?.entity) {
    const { order_id, id: paymentId } = event.payload.payment.entity;
    await capturePayment(order_id, paymentId);
  }

  if (event.event === "payment.failed" && event.payload?.payment?.entity) {
    const { order_id } = event.payload.payment.entity;
    // Doesn't clobber a row that's already CAPTURED — an out-of-order
    // "failed" for an earlier attempt on the same order shouldn't undo a
    // later successful one.
    await db.payment.updateMany({
      where: { razorpayOrderId: order_id, status: { not: "CAPTURED" } },
      data: { status: "FAILED" },
    });
  }

  return NextResponse.json({ ok: true });
}
