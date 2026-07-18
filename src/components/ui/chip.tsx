import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface ChipProps {
  label: string;
  active: boolean;
  dashed?: boolean;
  onClick: () => void;
  /** Optional small leading icon (category/payment-method chips) — tinted
   * with `color` when inactive, inherits the active state's text color
   * (currentColor) when selected so it doesn't clash with the filled
   * background. */
  icon?: LucideIcon;
  color?: string;
}

// Shared tap-to-select pill used for category/sub-category/payment-method
// pickers in both the manual add-expense wizard and the Gmail-import review
// form, so the two flows look and behave identically instead of each
// hand-rolling its own chip button styling.
export function Chip({ label, active, dashed, onClick, icon: Icon, color }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border transition-colors",
        active
          ? "bg-foreground text-background border-foreground"
          : dashed
            ? "border-dashed border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
            : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5" style={active ? undefined : { color }} />}
      {label}
    </button>
  );
}
