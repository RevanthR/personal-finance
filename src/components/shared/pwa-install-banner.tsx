"use client";

import { usePwaInstall } from "@/hooks/use-pwa-install";
import { IndianRupee, X, Share, Download, ArrowDownToLine } from "lucide-react";
import { cn } from "@/lib/utils";

export function PwaInstallBanner() {
  const { show, platform, canPrompt, install, dismiss } = usePwaInstall();

  if (!show) return null;

  const isIOS = platform === "ios";

  return (
    <div
      className={cn(
        "fixed inset-x-0 z-50 px-4 animate-in slide-in-from-bottom-3 duration-300",
      )}
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.5rem)" }}
    >
      <div className="max-w-sm mx-auto md:max-w-md rounded-xl bg-card text-foreground shadow-xl shadow-black/10 border border-border p-4">
        <div className="flex items-start gap-3">
          {/* App icon */}
          <div className="w-11 h-11 bg-warning-bg rounded-xl flex items-center justify-center shrink-0">
            <IndianRupee className="w-5 h-5 text-warning" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Add FinanceOS to your home screen</p>

            {isIOS ? (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Tap <Share className="w-3 h-3 inline mx-0.5 text-muted-foreground" /> then{" "}
                <span className="text-foreground font-medium">Add to Home Screen</span> for the full app experience.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Install for faster access, offline support, and a cleaner experience.
              </p>
            )}

            {!isIOS && canPrompt && (
              <button
                onClick={install}
                className="mt-2.5 flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                Install app
              </button>
            )}

            {!isIOS && !canPrompt && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <Download className="w-3 h-3" />
                Use your browser&apos;s install option to add this app.
              </p>
            )}
          </div>

          <button
            onClick={dismiss}
            className="p-1 rounded-lg hover:bg-muted transition-colors shrink-0 -mt-0.5"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {isIOS && (
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            {[
              { n: "1", label: "Open Safari share menu" },
              { n: "2", label: "Tap \"Add to Home Screen\"" },
              { n: "3", label: "Tap Add" },
            ].map(({ n, label }) => (
              <div key={n} className="flex items-center gap-1.5 flex-1">
                <span className="w-4 h-4 rounded-full bg-warning-bg text-warning text-xs font-bold flex items-center justify-center shrink-0">
                  {n}
                </span>
                <span className="text-xs text-muted-foreground leading-tight">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
