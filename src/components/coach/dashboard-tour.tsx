"use client";

import { useCoachDashboard } from "@/hooks/use-coach";
import { CheckCircle2, Plus, SlidersHorizontal, BarChart2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: BarChart2,
    iconClass: "text-indigo-600 bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-500/15",
    title: "Your monthly snapshot",
    desc: "Income and expenses for the month in one view. The progress bar shows how many bills you've settled.",
  },
  {
    icon: CheckCircle2,
    iconClass: "text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/15",
    title: "Mark items as paid",
    desc: "Tap ✓ on any row once you've paid it. Loan entries show the principal vs interest split for that payment.",
  },
  {
    icon: Plus,
    iconClass: "text-rose-600 bg-rose-100 dark:text-rose-400 dark:bg-rose-500/15",
    title: "One-off transactions",
    desc: "Use Add Transaction for spends or income that won't repeat: a restaurant bill, a bonus, a refund.",
  },
  {
    icon: SlidersHorizontal,
    iconClass: "text-violet-600 bg-violet-100 dark:text-violet-400 dark:bg-violet-500/15",
    title: "Set up recurring items",
    desc: "Go to Recurring to add your salary, EMIs, rent, and subscriptions. They auto-fill every month.",
  },
];

export function DashboardTour() {
  const { step, next, skip } = useCoachDashboard();

  if (step === null) return null;

  const current = steps[step];
  const Icon = current.icon;
  const total = steps.length;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={skip} />

      {/* Sits above mobile bottom nav (nav is ~64px + 1rem + safe-area from bottom) */}
      <div
        className="fixed inset-x-4 z-50 md:inset-auto md:left-1/2 md:-translate-x-1/2 md:w-96"
        style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
      >
        <div className="rounded-xl bg-background border shadow-2xl p-5 animate-in slide-in-from-bottom-2 duration-200">
          {/* Step dots + skip */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    i === step ? "w-5 bg-foreground" : "w-2 bg-muted"
                  )}
                />
              ))}
            </div>
            <button onClick={skip} className="p-1 rounded-lg hover:bg-muted transition-colors" aria-label="Skip tour">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="flex gap-3 mb-5">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", current.iconClass)}>
              <Icon className="w-[18px] h-[18px]" />
            </div>
            <div>
              <p className="font-semibold text-sm">{current.title}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{current.desc}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={skip}
              className="flex-1 text-sm text-muted-foreground py-2.5 rounded-xl hover:bg-muted transition-colors"
            >
              Skip
            </button>
            <button
              onClick={() => next(total)}
              className="flex-1 bg-foreground text-background text-sm font-medium py-2.5 rounded-xl hover:bg-foreground/90 transition-colors"
            >
              {step === total - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
