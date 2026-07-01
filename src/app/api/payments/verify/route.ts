import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPlan, addDays, PlanType } from "@/lib/plans";
import { validate, PaymentVerifySchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = validate(PaymentVerifySchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  // Verify HMAC signature
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expected !== razorpay_signature) {
    return NextResponse.json({ error: "Signature mismatch" }, { status: 400 });
  }

  const payment = await db.payment.findUnique({ where: { razorpayOrderId: razorpay_order_id } });
  if (!payment || payment.userId !== session.user.id) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const plan = getPlan(payment.planType as PlanType);
  if (!plan) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  // Extend from existing expiry (if active) or from today
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { planExpiry: true } });
  const base = user?.planExpiry && user.planExpiry > new Date() ? user.planExpiry : new Date();
  const newExpiry = addDays(base, plan.durationDays);

  await db.$transaction([
    db.payment.update({
      where: { razorpayOrderId: razorpay_order_id },
      data: { razorpayPaymentId: razorpay_payment_id, status: "CAPTURED" },
    }),
    db.user.update({
      where: { id: session.user.id },
      data: { planType: payment.planType, planExpiry: newExpiry },
    }),
  ]);

  return NextResponse.json({ ok: true, planType: payment.planType, planExpiry: newExpiry });
}
