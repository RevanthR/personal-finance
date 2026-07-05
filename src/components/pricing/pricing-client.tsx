"use client";

import { useState } from "react";
import { PLANS, Plan, isPlanActive, isTrialActive, trialDaysLeft, canSubscribeTo, PLAN_RANK, PlanType } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { CheckCircle2, Zap, Star, Clock, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

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
          theme: { color: "#ea580c" },
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
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscription</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Unlock full access to FinanceOS. Pay via UPI, cards, or net banking.
        </p>
      </div>

      {/* Status banner */}
      {active && expiryDate && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-emerald-800">{planType} plan active</span>
            <span className="text-emerald-600 ml-1">
              · expires {expiryDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>
      )}
      {trialActive && !active && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-amber-800">
              {daysLeft === 0 ? "Trial expires today" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left in your free trial`}
            </span>
            <p className="text-amber-600 text-xs mt-0.5">Subscribe below to keep uninterrupted access.</p>
          </div>
        </div>
      )}
      {trialExpired && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-red-700">Your free trial has ended</span>
            <p className="text-red-500 text-xs mt-0.5">Choose a plan below to continue using FinanceOS.</p>
          </div>
        </div>
      )}

      {/* Plans */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PLANS.map((plan) => {
          const isCurrent = active && planType === plan.id;
          const isLower = active && PLAN_RANK[plan.id] < currentRank;
          const isUpgrade = active && PLAN_RANK[plan.id] > currentRank;
          const canBuy = canSubscribeTo(planType, plan.id, active);

          return (
            <div
              key={plan.id}
              className={cn(
                "relative rounded-xl border p-5 space-y-4 transition-opacity",
                isCurrent ? "border-emerald-400 bg-emerald-50" :
                isLower ? "border-gray-100 bg-gray-50 opacity-50" :
                plan.highlight ? "border-amber-400 bg-white ring-1 ring-amber-200" : "border-gray-200 bg-white"
              )}
            >
              {plan.highlight && !isCurrent && !isLower && (
                <div className="absolute -top-2.5 left-4 flex items-center gap-1 bg-amber-400 text-zinc-900 text-xs font-semibold px-2 py-0.5 rounded-full">
                  <Star className="w-2.5 h-2.5" /> Popular
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-2.5 left-4 flex items-center gap-1 bg-emerald-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Current plan
                </div>
              )}
              <div>
                <p className={cn(
                  "text-xs font-medium uppercase tracking-widest",
                  isCurrent ? "text-emerald-700" :
                  "text-muted-foreground"
                )}>
                  {plan.label}
                </p>
                <p className="text-3xl font-bold mt-1 tracking-tight">
                  ₹{plan.price}
                  <span className={cn(
                    "text-sm font-normal ml-1",
                    isCurrent ? "text-emerald-600" : "text-muted-foreground"
                  )}>
                    /{plan.label.toLowerCase()}
                  </span>
                </p>
                <p className={cn(
                  "text-xs mt-0.5",
                  isCurrent ? "text-emerald-600" : "text-muted-foreground"
                )}>
                  {plan.perMonth}
                </p>
              </div>

              {isCurrent ? (
                <div className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium bg-emerald-100 text-emerald-700 cursor-default">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active
                </div>
              ) : isLower ? (
                <div className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium bg-gray-100 text-gray-400 cursor-not-allowed">
                  Lower tier
                </div>
              ) : (
                <button
                  onClick={() => canBuy && handleSubscribe(plan)}
                  disabled={loading !== null || !canBuy}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all",
                    plan.highlight
                      ? "bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                      : "bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                  )}
                >
                  {loading === plan.id ? (
                    <span className="animate-pulse">Opening payment...</span>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" />
                      {isUpgrade ? "Upgrade" : "Subscribe"}
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      {/* Feature list */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">What you get</p>
        {[
          "Dashboard with recurring income & expense tracking",
          "Full-year financial statistics",
          "Loan amortization & payment breakdown",
          "Chit fund tracking",
          "Receivables & personal loans",
          "Privacy mode & mobile PWA",
        ].map((f) => (
          <div key={f} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            {f}
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Payments processed securely via Razorpay · UPI, cards, net banking accepted
      </p>
    </div>
  );
}
