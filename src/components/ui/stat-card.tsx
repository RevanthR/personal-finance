import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative" | "warning";
  icon?: LucideIcon;
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-foreground",
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
};

// Replaces hand-rolled stat tiles (dashboard totals, year-view summaries)
// that mixed p-3/p-4 padding and rounded-lg/rounded-xl inconsistently.
export function StatCard({ label, value, hint, tone = "default", icon: Icon, className }: StatCardProps) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between mb-1">
        <span className="fin-label">{label}</span>
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
      </div>
      <p className={cn("fin-amount text-xl font-bold", TONE_CLASSES[tone])}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}
