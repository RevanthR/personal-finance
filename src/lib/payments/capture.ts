import { db } from "@/lib/db";
import { getPlan, addDays, PlanType } from "@/lib/plans";

// Shared by the client-triggered verify route, the Razorpay webhook, and the
// reconciliation sweep — all three can learn about the same captured
// payment through independent paths, and with the webhook now wired up the
// client verify call and the webhook routinely fire within milliseconds of
// each other for one payment. So this has to be both idempotent and safe
// under concurrent callers, not just "run once."
export async function capturePayment(razorpayOrderId: string, razorpayPaymentId: string): Promise<boolean> {
  // A second caller racing on the same order/user has to wait out this
  // whole transaction (the CAS update below plus the row lock) before it
  // can even see whether it lost — Prisma's 5s default is tight for that
  // plus Neon's per-round-trip latency, so give it real headroom rather
  // than fail the loser outright instead of letting it just no-op.
  return db.$transaction(async (tx) => {
    // Compare-and-swap: only the caller that actually flips the row wins,
    // so two near-simultaneous callers for the same payment can't both
    // extend the plan. Matches on "not already CAPTURED" rather than
    // "== CREATED" so a stray FAILED mark from an earlier failed attempt on
    // the same order can't block a later, authoritative capture — Razorpay
    // doesn't guarantee webhook delivery order.
    const { count } = await tx.payment.updateMany({
      where: { razorpayOrderId, status: { not: "CAPTURED" } },
      data: { razorpayPaymentId, status: "CAPTURED" },
    });
    if (count === 0) return false;

    const payment = await tx.payment.findUnique({ where: { razorpayOrderId } });
    if (!payment) return false;
    const plan = getPlan(payment.planType as PlanType);
    if (!plan) return false;

    // Row-lock the user for the rest of this transaction. The CAS above
    // already prevents one order being double-processed; this covers two
    // *different* successful orders for the same person landing within
    // milliseconds of each other, so a read-modify-write on planExpiry
    // can't lose one extension to the other.
    const [locked] = await tx.$queryRaw<{ planExpiry: Date | null }[]>`
      SELECT "planExpiry" FROM "User" WHERE id = ${payment.userId} FOR UPDATE
    `;
    const base = locked?.planExpiry && locked.planExpiry > new Date() ? locked.planExpiry : new Date();
    const newExpiry = addDays(base, plan.durationDays);

    await tx.user.update({
      where: { id: payment.userId },
      data: { planType: payment.planType, planExpiry: newExpiry },
    });
    return true;
  }, { maxWait: 10_000, timeout: 10_000 });
}
