"use client";

import { useState } from "react";
import { MailWarning, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type GmailStatus = "ok" | "reminder" | "broken";

// Account-level, not month-scoped — surfaces the same connection state
// regardless of which month is being viewed. Dismissible only for the
// current view (plain useState, not persisted): reappears on the next
// visit rather than being permanently silenceable, since ignoring it means
// real transactions silently go missing (see the ₹570 Axis investigation).
export function GmailReconnectBanner({ status }: { status: GmailStatus }) {
  const [dismissed, setDismissed] = useState(false);
  if (status === "ok" || dismissed) return null;

  const isBroken = status === "broken";

  return (
    <div className={cn(
      "flex items-start gap-3 rounded-xl border p-3 mb-4",
      isBroken ? "border-negative-border bg-negative-bg" : "border-warning-border bg-warning-bg"
    )}>
      <MailWarning className={cn("w-4 h-4 mt-0.5 shrink-0", isBroken ? "text-negative" : "text-warning")} />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold", isBroken ? "text-negative" : "text-warning")}>
          {isBroken ? "Gmail sync stopped working" : "Gmail sync needs reconnecting soon"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isBroken
            ? "Your Gmail connection expired, so new transactions aren't being picked up."
            : "Your Gmail connection is about to expire (Google requires reconnecting periodically)."}
        </p>
        <a
          href="/api/gmail/connect"
          className={cn(
            "inline-block mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg text-white",
            isBroken ? "bg-negative hover:bg-negative/90" : "bg-warning hover:bg-warning/90"
          )}
        >
          Reconnect Gmail
        </a>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded-lg hover:bg-black/5 transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
}
