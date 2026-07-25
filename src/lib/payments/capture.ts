import { db } from "@/lib/db";
import { getPlan, addDays, PlanType } from "@/lib/plans";

// Shared by the client-triggered verify route, the Razorpay webhook, and the
// reconciliation sweep below — all three learn about a captured payment
// through different paths, but "what happens once we know" should only be
// written once.
export async function capturePayment(razorpayOrderId: string, razorpayPaymentId: string): Promise<boolean> {
  const payment = await db.payment.findUnique({ where: { razorpayOrderId } });
  if (!payment || payment.status === "CAPTURED") return false;

  const plan = getPlan(payment.planType as PlanType);
  if (!plan) return false;

  const user = await db.user.findUnique({ where: { id: payment.userId }, select: { planExpiry: true } });
  const base = user?.planExpiry && user.planExpiry > new Date() ? user.planExpiry : new Date();
  const newExpiry = addDays(base, plan.durationDays);

  await db.$transaction([
    db.payment.update({
      where: { razorpayOrderId },
      data: { razorpayPaymentId, status: "CAPTURED" },
    }),
    db.user.update({
      where: { id: payment.userId },
      data: { planType: payment.planType, planExpiry: newExpiry },
    }),
  ]);
  return true;
}
