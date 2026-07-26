import { getSession } from "@/lib/get-session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PricingClient } from "@/components/pricing/pricing-client";
import { reconcilePendingPaymentsForUser } from "@/lib/payments/reconcile";
import { isAccessAllowed } from "@/lib/plans";

async function getUserPlan(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: { planType: true, planExpiry: true, trialEndsAt: true },
  });
}

export default async function PricingPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const isAdmin = session.user.role === "ADMIN";
  let user = await getUserPlan(session.user.id);

  // A payment can succeed on Razorpay's side while both our normal capture
  // paths (the client-side verify call, the webhook) miss it. This is the
  // exact page a blocked user lands on, so it's the one place worth an
  // extra Razorpay lookup to self-heal — not admins (who are never actually
  // blocked) and not on every other page in the app.
  if (!isAdmin && user && !isAccessAllowed(user)) {
    const reconciled = await reconcilePendingPaymentsForUser(session.user.id);
    if (reconciled) {
      const refreshed = await getUserPlan(session.user.id);
      if (refreshed && isAccessAllowed(refreshed)) redirect("/dashboard");
      user = refreshed;
    }
  }

  return (
    <PricingClient
      planType={user?.planType ?? "FREE"}
      planExpiry={user?.planExpiry ? user.planExpiry.toISOString() : null}
      trialEndsAt={user?.trialEndsAt ? user.trialEndsAt.toISOString() : null}
      razorpayKeyId={process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? ""}
    />
  );
}
