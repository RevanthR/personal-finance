import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { capturePayment } from "@/lib/payments/capture";

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

  if (expected !== sig) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body) as {
    event: string;
    payload: { payment: { entity: { order_id: string; id: string } } };
  };

  if (event.event === "payment.captured") {
    const { order_id, id: paymentId } = event.payload.payment.entity;
    await capturePayment(order_id, paymentId);
  }

  if (event.event === "payment.failed") {
    const { order_id } = event.payload.payment.entity;
    await db.payment.updateMany({
      where: { razorpayOrderId: order_id },
      data: { status: "FAILED" },
    });
  }

  return NextResponse.json({ ok: true });
}
