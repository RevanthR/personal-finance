"use client";

import { useCoachWelcome } from "@/hooks/use-coach";
import { IndianRupee, LayoutDashboard, TrendingUp, SlidersHorizontal, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  { icon: LayoutDashboard, iconClass: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400", label: "Dashboard", desc: "Mark bills paid, track monthly progress." },
  { icon: TrendingUp, iconClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400", label: "Statistics", desc: "Full-year income vs expense view." },
  { icon: SlidersHorizontal, iconClass: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400", label: "Configuration", desc: "Set up recurring items once; they auto-fill every month." },
  { icon: Coins, iconClass: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400", label: "Chit Funds", desc: "Track contributions, savings, and lifts." },
];

export function WelcomeModal() {
  const { show, dismiss } = useCoachWelcome();

  if (!show) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={dismiss} />

      <div className="fixed inset-x-0 bottom-0 z-50 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-sm md:px-0 px-0">
        <div className="rounded-t-3xl md:rounded-2xl bg-background shadow-2xl border-t md:border overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Handle pill — mobile only */}
          <div className="flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-muted" />
          </div>

          {/* Header */}
          <div className="bg-warning-bg mx-4 md:mx-0 rounded-xl px-5 pt-5 pb-5 text-center mt-2 md:mt-0 md:rounded-none border border-warning-border md:border-x-0">
            <div className="w-12 h-12 bg-warning rounded-xl flex items-center justify-center mx-auto mb-3">
              <IndianRupee className="w-6 h-6 text-white" />
            </div>
            <p className="text-lg font-bold text-foreground">Welcome to FinanceOS</p>
            <p className="text-sm text-muted-foreground mt-1">Your personal finance command centre</p>
          </div>

          {/* Features */}
          <div className="px-5 py-4 space-y-3">
            {features.map(({ icon: Icon, iconClass, label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5", iconClass)}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Button */}
          <div
            className="px-5 pt-1 pb-5"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={dismiss}
              className="w-full bg-primary text-white rounded-xl py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Get started
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
