import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPlan, addDays, PlanType } from "@/lib/plans";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
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

    const payment = await db.payment.findUnique({ where: { razorpayOrderId: order_id } });
    if (!payment || payment.status === "CAPTURED") return NextResponse.json({ ok: true });

    const plan = getPlan(payment.planType as PlanType);
    if (!plan) return NextResponse.json({ ok: true });

    const user = await db.user.findUnique({ where: { id: payment.userId }, select: { planExpiry: true } });
    const base = user?.planExpiry && user.planExpiry > new Date() ? user.planExpiry : new Date();
    const newExpiry = addDays(base, plan.durationDays);

    await db.$transaction([
      db.payment.update({
        where: { razorpayOrderId: order_id },
        data: { razorpayPaymentId: paymentId, status: "CAPTURED" },
      }),
      db.user.update({
        where: { id: payment.userId },
        data: { planType: payment.planType, planExpiry: newExpiry },
      }),
    ]);
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
