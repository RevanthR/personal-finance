"use client";

import { trialDaysLeft } from "@/lib/plans";
import { Clock } from "lucide-react";
import Link from "next/link";

export function TrialBanner({ trialEndsAt }: { trialEndsAt: string }) {
  const days = trialDaysLeft(trialEndsAt);
  const urgent = days <= 1;

  return (
    // When shown, this is the topmost element, so it (not the header) has
    // to clear the iOS status bar — viewport-fit=cover runs the web view
    // edge to edge under it.
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-xs ${urgent ? "bg-negative text-white" : "bg-warning text-white dark:text-background"}`}
      style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">
          {days === 0
            ? "Your free trial expires today."
            : `${days} day${days !== 1 ? "s" : ""} left in your free trial.`}
        </span>
      </div>
      <Link
        href="/pricing"
        className={`shrink-0 font-semibold underline underline-offset-2 ${urgent ? "text-white" : "text-white dark:text-background"}`}
      >
        Subscribe now
      </Link>
    </div>
  );
}
