import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
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

// Column count follows the number of stats instead of a fixed 6, so a
// card with only 3 stats (e.g. Year View's Balance/Income/Expenses) fills
// its row at 3-wide instead of getting stretched across 6 narrow columns
// with dead space on the right and the values getting truncated.
// Exported so SummaryCardSkeleton below stays pixel-for-pixel in sync with
// the real column logic instead of duplicating (and inevitably drifting
// from) this lookup.
export const GRID_COLS_BY_COUNT: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

// Coin by Zerodha's compound overview-card pattern: a small pill label
// floats overlapping the card's top edge, a stat row sits on the white
// card body, and an optional secondary muted-bg "toolbar" band holds
// quick-action links along the bottom, all inside one visual unit.
export function SummaryCard({ tag, stats, toolbar, className }: SummaryCardProps) {
  // Only reserve hint-line height when at least one stat actually has a
  // hint — reserving it unconditionally left a dead strip of empty space
  // at the bottom of cards where no stat uses hints at all.
  const anyHint = stats.some(s => s.hint);
  const colsClass = GRID_COLS_BY_COUNT[stats.length] ?? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6";
  return (
    <div className={cn("relative rounded-lg border border-border bg-card", className)}>
      <span className="absolute -top-3 left-4 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
        {tag}
      </span>
      <div className={cn("grid gap-x-6 gap-y-4 px-4 pt-6 pb-4", colsClass)}>
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

// Co-located with SummaryCard for the same reason as PageHeaderSkeleton —
// shares its exact column-count logic via GRID_COLS_BY_COUNT so a real
// layout change (e.g. Year View going from 3 stats to 4) doesn't need a
// second, separate update somewhere in a loading.tsx.
export function SummaryCardSkeleton({ statCount = 3, className }: { statCount?: number; className?: string }) {
  const colsClass = GRID_COLS_BY_COUNT[statCount] ?? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6";
  return (
    <div className={cn("relative rounded-lg border border-border bg-card", className)}>
      <span className="absolute -top-3 left-4 h-6 w-24 rounded-full bg-muted" />
      <div className={cn("grid gap-x-6 gap-y-4 px-4 pt-6 pb-4", colsClass)}>
        {Array.from({ length: statCount }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
