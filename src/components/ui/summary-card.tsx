import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface SummaryStat {
  label: ReactNode;
  value: string;
  valueClass?: string;
  hint?: ReactNode;
  onClick?: () => void;
}

interface SummaryCardProps {
  tag: string;
  stats: SummaryStat[];
  toolbar?: ReactNode;
  className?: string;
}

// Coin by Zerodha's compound overview-card pattern: a small pill label
// floats overlapping the card's top edge, a stat row sits on the white
// card body, and an optional secondary muted-bg "toolbar" band holds
// quick-action links along the bottom, all inside one visual unit.
export function SummaryCard({ tag, stats, toolbar, className }: SummaryCardProps) {
  return (
    <div className={cn("relative rounded-lg border border-border bg-card", className)}>
      <span className="absolute -top-3 left-4 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
        {tag}
      </span>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4 px-4 pt-6 pb-4">
        {stats.map((s, i) => {
          const Comp = s.onClick ? "button" : "div";
          return (
            <Comp key={i} onClick={s.onClick} className={s.onClick ? "text-left" : undefined}>
              <p className="text-xs text-muted-foreground flex items-center gap-1">{s.label}</p>
              <p className={cn("text-lg font-bold tabular-nums mt-0.5", s.valueClass ?? "text-foreground")}>{s.value}</p>
              {/* Reserved height even when empty so every stat's baseline lines
                  up within its row — a missing hint used to leave a ragged edge. */}
              <div className="mt-0.5 min-h-[1.25rem]">{s.hint}</div>
            </Comp>
          );
        })}
      </div>
      {toolbar && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-t border-border bg-muted/50 rounded-b-lg text-sm">
          {toolbar}
        </div>
      )}
    </div>
  );
}
