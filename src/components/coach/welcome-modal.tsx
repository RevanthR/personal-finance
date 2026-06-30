"use client";

import { useCoachWelcome } from "@/hooks/use-coach";
import { IndianRupee, LayoutDashboard, TrendingUp, SlidersHorizontal, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  { icon: LayoutDashboard, color: "text-indigo-500 bg-indigo-50", label: "Dashboard", desc: "Mark bills paid, track monthly progress." },
  { icon: TrendingUp, color: "text-blue-500 bg-blue-50", label: "Statistics", desc: "Full-year income vs expense view." },
  { icon: SlidersHorizontal, color: "text-violet-500 bg-violet-50", label: "Configuration", desc: "Set up recurring items once — they auto-fill every month." },
  { icon: Coins, color: "text-amber-500 bg-amber-50", label: "Chit Funds", desc: "Track contributions, savings, and lifts." },
];

export function WelcomeModal() {
  const { show, dismiss } = useCoachWelcome();

  if (!show) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={dismiss} />
      <div className="fixed inset-x-4 bottom-4 top-auto z-50 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-sm">
        <div className="rounded-2xl bg-background shadow-2xl border overflow-hidden animate-in slide-in-from-bottom-4 duration-300 md:animate-in md:zoom-in-95">
          {/* Header */}
          <div className="bg-zinc-950 px-5 pt-6 pb-5 text-white text-center">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <IndianRupee className="w-6 h-6 text-white" />
            </div>
            <p className="text-lg font-bold">Welcome to FinanceOS</p>
            <p className="text-sm text-zinc-400 mt-1">Your personal finance command centre</p>
          </div>

          {/* Features */}
          <div className="px-5 py-4 space-y-3">
            {features.map(({ icon: Icon, color, label, desc }) => {
              const [iconColor, bgColor] = color.split(" ");
              return (
                <div key={label} className="flex items-start gap-3">
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5", bgColor)}>
                    <Icon className={cn("w-3.5 h-3.5", iconColor)} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-5 pb-5">
            <button
              onClick={dismiss}
              className="w-full bg-zinc-950 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              Get started
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
