import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { PricingClient } from "@/components/pricing/pricing-client";

export default async function PricingPage() {
  const session = await getSession();
  const user = session?.user?.id
    ? await db.user.findUnique({
        where: { id: session.user.id },
        select: { planType: true, planExpiry: true },
      })
    : null;

  return (
    <PricingClient
      planType={user?.planType ?? "FREE"}
      planExpiry={user?.planExpiry ? user.planExpiry.toISOString() : null}
      razorpayKeyId={process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? ""}
    />
  );
}
