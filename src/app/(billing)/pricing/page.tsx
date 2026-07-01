import { getSession } from "@/lib/get-session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PricingClient } from "@/components/pricing/pricing-client";

export default async function PricingPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { planType: true, planExpiry: true, trialEndsAt: true },
  });

  return (
    <PricingClient
      planType={user?.planType ?? "FREE"}
      planExpiry={user?.planExpiry ? user.planExpiry.toISOString() : null}
      trialEndsAt={user?.trialEndsAt ? user.trialEndsAt.toISOString() : null}
      razorpayKeyId={process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? ""}
    />
  );
}
