"use client";

import { cn } from "@/lib/utils";
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
    <div className={cn("flex items-center gap-6 border-b border-border", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex items-center gap-1.5 pb-3 text-sm transition-colors",
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
