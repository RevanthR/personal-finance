"use client";

import { useState } from "react";
import { PLANS, Plan, isPlanActive, PlanType } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { CheckCircle2, Zap, Star } from "lucide-react";
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

export function PricingClient({ planType, planExpiry, razorpayKeyId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<PlanType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = isPlanActive(planExpiry ? new Date(planExpiry) : null);
  const expiryDate = planExpiry ? new Date(planExpiry) : null;

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
          theme: { color: "#18181b" },
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

      {/* Current plan banner */}
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

      {/* Plans */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "relative rounded-2xl border p-5 space-y-4",
              plan.highlight ? "border-zinc-900 bg-zinc-950 text-white" : "border-zinc-200 bg-white"
            )}
          >
            {plan.highlight && (
              <div className="absolute -top-2.5 left-4 flex items-center gap-1 bg-amber-400 text-zinc-900 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                <Star className="w-2.5 h-2.5" /> Popular
              </div>
            )}
            <div>
              <p className={cn("text-xs font-medium uppercase tracking-widest", plan.highlight ? "text-zinc-400" : "text-muted-foreground")}>
                {plan.label}
              </p>
              <p className="text-3xl font-bold mt-1">
                ₹{plan.price}
                <span className={cn("text-sm font-normal ml-1", plan.highlight ? "text-zinc-400" : "text-muted-foreground")}>
                  /{plan.label.toLowerCase()}
                </span>
              </p>
              <p className={cn("text-xs mt-0.5", plan.highlight ? "text-zinc-400" : "text-muted-foreground")}>
                {plan.perMonth}
              </p>
            </div>

            <button
              onClick={() => handleSubscribe(plan)}
              disabled={loading !== null}
              className={cn(
                "w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all",
                plan.highlight
                  ? "bg-white text-zinc-900 hover:bg-zinc-100 disabled:opacity-50"
                  : "bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
              )}
            >
              {loading === plan.id ? (
                <span className="animate-pulse">Opening payment...</span>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  {active ? "Extend plan" : "Subscribe"}
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      {/* Feature list */}
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What you get</p>
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
