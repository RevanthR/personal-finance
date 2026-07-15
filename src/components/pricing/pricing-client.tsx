"use client";

import { useState } from "react";
import { PLANS, Plan, isPlanActive, isTrialActive, trialDaysLeft, canSubscribeTo, PLAN_RANK, PlanType } from "@/lib/plans";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, Zap, Star, Clock, AlertTriangle, ShieldCheck,
  LayoutDashboard, CalendarRange, Landmark, Users, PiggyBank, Lock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

interface Props {
  planType: string;
  planExpiry: string | null;
  trialEndsAt: string | null;
  razorpayKeyId: string;
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.getElementById("razorpay-script")) return resolve(true);
    const s = document.createElement("script");
    s.id = "razorpay-script";
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// Every plan's cost, normalized to a 30-day rate, so savings vs the shortest
// plan are a real computed number rather than a made-up "was/now" price.
const WEEKLY_MONTHLY_RATE = (PLANS.find((p) => p.id === "WEEKLY")!.price / PLANS.find((p) => p.id === "WEEKLY")!.durationDays) * 30;
function savingsPercent(plan: Plan): number {
  const rate = (plan.price / plan.durationDays) * 30;
  return Math.round((1 - rate / WEEKLY_MONTHLY_RATE) * 100);
}

const FEATURES = [
  { icon: LayoutDashboard, text: "Recurring income & expense tracking" },
  { icon: CalendarRange, text: "Full-year financial statistics" },
  { icon: Landmark, text: "Loan amortization & payment breakdown" },
  { icon: PiggyBank, text: "Chit fund tracking" },
  { icon: Users, text: "Receivables & personal loans" },
  { icon: Lock, text: "Privacy mode & mobile PWA" },
];

export function PricingClient({ planType, planExpiry, trialEndsAt, razorpayKeyId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<PlanType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = isPlanActive(planExpiry ? new Date(planExpiry) : null);
  const expiryDate = planExpiry ? new Date(planExpiry) : null;
  const trialActive = isTrialActive(trialEndsAt);
  const daysLeft = trialDaysLeft(trialEndsAt);
  const trialExpired = !trialActive && !active;
  const currentRank = active ? (PLAN_RANK[planType as PlanType] ?? 0) : 0;

  async function handleSubscribe(plan: Plan) {
    setError(null);
    setLoading(plan.id);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Could not load payment SDK. Check your connection.");

      const res = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planType: plan.id }),
      });
      if (!res.ok) throw new Error("Failed to create order");
      const { orderId, amount, currency } = await res.json();

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: razorpayKeyId,
          order_id: orderId,
          amount,
          currency,
          name: "FinanceOS",
          description: `${plan.label} subscription`,
          theme: { color: "#2563eb" },
          method: {
            upi: true,
            card: true,
            netbanking: true,
            wallet: false,
            emi: false,
            paylater: false,
          },
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            });
            if (!verifyRes.ok) {
              reject(new Error("Payment verification failed"));
              return;
            }
            resolve();
          },
          modal: {
            ondismiss: () => reject(new Error("cancelled")),
          },
        });
        rzp.open();
      });

      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (msg !== "cancelled") setError(msg);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader className="mb-2" title="Subscription" subtitle="Unlock full access to FinanceOS. Pay via UPI, cards, or net banking." />

      {/* Status banner */}
      {active && expiryDate && (
        <div className="flex items-center gap-3 rounded-lg border border-positive-border bg-positive-bg px-4 py-3">
          <div className="w-8 h-8 rounded-full bg-positive/15 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-positive" />
          </div>
          <div className="text-sm">
            <span className="font-semibold text-positive">{planType} plan active</span>
            <span className="text-positive/80 ml-1">
              · expires {expiryDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>
      )}
      {trialActive && !active && (
        <div className="flex items-center gap-3 rounded-lg border border-warning-border bg-warning-bg px-4 py-3">
          <div className="w-8 h-8 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-warning" />
          </div>
          <div className="text-sm">
            <span className="font-semibold text-warning">
              {daysLeft === 0 ? "Trial expires today" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left in your free trial`}
            </span>
            <p className="text-warning/80 text-xs mt-0.5">Subscribe below to keep uninterrupted access.</p>
          </div>
        </div>
      )}
      {trialExpired && (
        <div className="flex items-center gap-3 rounded-lg border border-negative-border bg-negative-bg px-4 py-3">
          <div className="w-8 h-8 rounded-full bg-negative/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-negative" />
          </div>
          <div className="text-sm">
            <span className="font-semibold text-negative">Your free trial has ended</span>
            <p className="text-negative/80 text-xs mt-0.5">Choose a plan below to continue using FinanceOS.</p>
          </div>
        </div>
      )}

      {/* Plans — one row on desktop so all four tiers sit side by side for
          a direct compare, instead of wrapping into a 2x2 grid. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {PLANS.map((plan) => {
          const isCurrent = active && planType === plan.id;
          const isLower = active && PLAN_RANK[plan.id] < currentRank;
          const isUpgrade = active && PLAN_RANK[plan.id] > currentRank;
          const canBuy = canSubscribeTo(planType, plan.id, active);
          const savings = savingsPercent(plan);

          return (
            <Card
              key={plan.id}
              className={cn(
                "relative flex flex-col p-4 pt-6 gap-4 transition-all",
                isCurrent ? "border-positive-border bg-positive-bg" :
                isLower ? "border-border bg-muted opacity-60" :
                plan.highlight ? "border-primary ring-1 ring-primary shadow-sm" : ""
              )}
            >
              {plan.highlight && !isCurrent && !isLower && (
                <div className="absolute -top-2.5 left-4 flex items-center gap-1 bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded-full">
                  <Star className="w-2.5 h-2.5 fill-current" /> Popular
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-2.5 left-4 flex items-center gap-1 bg-positive text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Current
                </div>
              )}

              <div className="flex-1">
                <p className={cn(
                  "text-[11px] font-semibold uppercase tracking-widest",
                  isCurrent ? "text-positive" : "text-muted-foreground"
                )}>
                  {plan.label}
                </p>
                <p className="text-3xl sm:text-4xl font-bold mt-2 tracking-tight tabular-nums leading-none">
                  ₹{plan.price}
                </p>
                <p className={cn(
                  "text-xs mt-2 tabular-nums",
                  isCurrent ? "text-positive/80" : "text-muted-foreground"
                )}>
                  {plan.perMonth} · {plan.durationDays}d
                </p>
                {savings > 0 && (
                  <p className={cn(
                    "text-xs font-semibold mt-2",
                    isCurrent ? "text-positive" : "text-primary"
                  )}>
                    Save {savings}% vs weekly
                  </p>
                )}
              </div>

              {isCurrent ? (
                <div className="w-full flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium bg-positive-bg text-positive cursor-default">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active
                </div>
              ) : isLower ? (
                <div className="w-full flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium bg-muted text-muted-foreground cursor-not-allowed">
                  Lower tier
                </div>
              ) : (
                <Button
                  onClick={() => canBuy && handleSubscribe(plan)}
                  disabled={loading !== null || !canBuy}
                  variant={plan.highlight ? "default" : "outline"}
                  className="w-full"
                >
                  {loading === plan.id ? (
                    <span className="animate-pulse">Opening...</span>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" />
                      {isUpgrade ? "Upgrade" : "Subscribe"}
                    </>
                  )}
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-negative text-center">{error}</p>
      )}

      {/* Feature list */}
      <Card className="p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">What you get</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          {FEATURES.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2.5 text-sm">
              <div className="w-6 h-6 rounded-full bg-positive-bg flex items-center justify-center shrink-0">
                <Icon className="w-3 h-3 text-positive" />
              </div>
              {text}
            </div>
          ))}
        </div>
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck className="w-3.5 h-3.5" />
        Payments processed securely via Razorpay · UPI, cards, net banking accepted
      </p>
    </div>
  );
}
