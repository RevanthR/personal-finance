import { cn } from "@/lib/utils";

interface ChipProps {
  label: string;
  active: boolean;
  dashed?: boolean;
  onClick: () => void;
}

// Shared tap-to-select pill used for category/sub-category/payment-method
// pickers in both the manual add-expense wizard and the Gmail-import review
// form, so the two flows look and behave identically instead of each
// hand-rolling its own chip button styling.
export function Chip({ label, active, dashed, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
        active
          ? "bg-foreground text-background border-foreground"
          : dashed
            ? "border-dashed border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
            : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}
