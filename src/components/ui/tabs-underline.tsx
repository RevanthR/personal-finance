"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";

export interface TabsUnderlineOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

interface TabsUnderlineProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: TabsUnderlineOption<T>[];
  className?: string;
}

// Plain text tabs with a blue underline on the active one — replaces the
// filled-pill SegmentedControl for primary page navigation (Coin by
// Zerodha's tab pattern: bold + underline, not a filled background).
export function TabsUnderline<T extends string>({ value, onChange, options, className }: TabsUnderlineProps<T>) {
  return (
    // inline-flex, not flex — a block-level flex container fills its
    // parent's full width by default, which stretched the border-b into a
    // stray hairline running edge-to-edge across the page with the tabs
    // sitting in the corner of it. Sizing to content keeps the line scoped
    // to the tabs themselves.
    <div className={cn("inline-flex items-center gap-6 border-b border-border", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex items-center gap-1.5 pb-3 text-sm transition-colors rounded-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
              active ? "font-semibold text-primary" : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {opt.label}
            {typeof opt.count === "number" && opt.count > 0 && (
              <span className="text-[10px] font-semibold text-primary bg-accent px-1.5 py-0.5 rounded-full">
                {opt.count}
              </span>
            )}
            {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />}
          </button>
        );
      })}
    </div>
  );
}

// Co-located so a real style change to TabsUnderline (padding, border,
// gap) can't silently drift out of sync with every page's loading state —
// every loading.tsx uses this instead of guessing at a pill/segmented
// shape that isn't what tabs actually look like anymore.
export function TabsUnderlineSkeleton({ count = 2, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-6 border-b border-border pb-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: 60 + (i % 3) * 20 }} />
      ))}
    </div>
  );
}
