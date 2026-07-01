"use client";

import { trialDaysLeft } from "@/lib/plans";
import { Clock } from "lucide-react";
import Link from "next/link";

export function TrialBanner({ trialEndsAt }: { trialEndsAt: string }) {
  const days = trialDaysLeft(trialEndsAt);
  const urgent = days <= 1;

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2 text-xs ${urgent ? "bg-red-600 text-white" : "bg-amber-500 text-zinc-900"}`}>
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
        className={`shrink-0 font-semibold underline underline-offset-2 ${urgent ? "text-white" : "text-zinc-900"}`}
      >
        Subscribe now
      </Link>
    </div>
  );
}
