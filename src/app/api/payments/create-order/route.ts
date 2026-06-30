import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getPlan, PlanType } from "@/lib/plans";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { planType } = await req.json() as { planType: PlanType };
  const plan = getPlan(planType);
  if (!plan) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const order = await razorpay.orders.create({
    amount: plan.pricePaise,
    currency: "INR",
    receipt: `${session.user.id}_${Date.now()}`,
    notes: { userId: session.user.id, planType },
  });

  await db.payment.create({
    data: {
      userId: session.user.id,
      razorpayOrderId: order.id,
      planType,
      amount: plan.pricePaise,
      status: "CREATED",
    },
  });

  return NextResponse.json({ orderId: order.id, amount: plan.pricePaise, currency: "INR" });
}
