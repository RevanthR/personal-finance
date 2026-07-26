import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getPlan, canSubscribeTo, isPlanActive } from "@/lib/plans";
import { validate, PaymentOrderSchema } from "@/lib/validation";

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// A pending order this fresh is still a plausible in-progress checkout.
// Reusing it instead of minting a new Razorpay order on every click is what
// actually stops a double-click (or a retry after a slow first attempt)
// from leaving behind a second live, abandoned order for the exact same
// purchase — which is precisely the pattern that produced two of the four
// stray CREATED rows this investigation started from.
const REUSE_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = validate(PaymentOrderSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { planType } = parsed.data;

  const plan = getPlan(planType);
  if (!plan) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  // The pricing page already hides ineligible plans, but that's a UI nicety,
  // not enforcement — nothing stopped a direct POST from minting a real
  // order for a plan the user shouldn't be able to buy.
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { planType: true, planExpiry: true } });
  const active = isPlanActive(user?.planExpiry ?? null);
  if (!canSubscribeTo(user?.planType ?? "FREE", planType, active)) {
    return NextResponse.json({ error: "Not eligible for this plan" }, { status: 400 });
  }

  const existing = await db.payment.findFirst({
    where: {
      userId: session.user.id,
      planType,
      status: "CREATED",
      amount: plan.pricePaise, // skip a stale order if pricing changed since it was created
      createdAt: { gt: new Date(Date.now() - REUSE_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return NextResponse.json({ orderId: existing.razorpayOrderId, amount: existing.amount, currency: "INR" });
  }

  const order = await razorpay.orders.create({
    amount:   plan.pricePaise,
    currency: "INR",
    receipt:  `${session.user.id}_${Date.now()}`,
    notes:    { userId: session.user.id, planType },
  });

  await db.payment.create({
    data: {
      userId:         session.user.id,
      razorpayOrderId: order.id,
      planType,
      amount:          plan.pricePaise,
      status:          "CREATED",
    },
  });

  return NextResponse.json({ orderId: order.id, amount: plan.pricePaise, currency: "INR" });
}
