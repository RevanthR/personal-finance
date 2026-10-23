import { requireApiUser } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { validate, PaymentVerifySchema } from "@/lib/validation";
import { capturePayment } from "@/lib/payments/capture";
import { safeEqual } from "@/lib/payments/signature";

export async function POST(req: NextRequest) {
  const me = await requireApiUser();
  if (!me.ok) return me.response;

  const parsed = validate(PaymentVerifySchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  // Verify HMAC signature
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (!safeEqual(expected, razorpay_signature)) {
    return NextResponse.json({ error: "Signature mismatch" }, { status: 400 });
  }

  const payment = await db.payment.findUnique({ where: { razorpayOrderId: razorpay_order_id } });
  if (!payment || payment.userId !== me.id) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  await capturePayment(razorpay_order_id, razorpay_payment_id);

  const user = await db.user.findUnique({ where: { id: me.id }, select: { planType: true, planExpiry: true } });
  return NextResponse.json({ ok: true, planType: user?.planType, planExpiry: user?.planExpiry });
}
