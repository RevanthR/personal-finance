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
  // Only reserve hint-line height when at least one stat actually has a
  // hint — reserving it unconditionally left a dead strip of empty space
  // at the bottom of cards where no stat uses hints at all.
  const anyHint = stats.some(s => s.hint);
  return (
    <div className={cn("relative rounded-lg border border-border bg-card", className)}>
      <span className="absolute -top-3 left-4 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
        {tag}
      </span>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4 px-4 pt-6 pb-4">
        {stats.map((s, i) => {
          const Comp = s.onClick ? "button" : "div";
          return (
            <Comp key={i} onClick={s.onClick} className={cn("min-w-0", s.onClick && "text-left")}>
              <p className="text-xs text-muted-foreground flex items-center gap-1">{s.label}</p>
              {/* text-base on mobile, not text-lg — an extra digit at text-lg
                  was wide enough to overflow a 2-col grid cell on narrow
                  screens (grid items default to min-width:auto, so the cell
                  wouldn't shrink and pushed the layout instead of the text). */}
              <p className={cn("text-base sm:text-lg font-bold tabular-nums mt-0.5 truncate", s.valueClass ?? "text-foreground")} title={s.value}>{s.value}</p>
              {anyHint && <div className="mt-0.5 min-h-[1.25rem]">{s.hint}</div>}
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
