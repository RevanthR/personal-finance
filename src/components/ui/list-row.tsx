import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface ListRowProps {
  avatarLabel?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing: ReactNode;
  onClick?: () => void;
  className?: string;
}

// Shared transaction/list-item row — dashboard and Sync review both
// hand-rolled their own version of this with different padding, radius,
// and avatar shape before this existed.
export function ListRow({ avatarLabel, title, subtitle, trailing, onClick, className }: ListRowProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left",
        onClick && "transition-colors hover:bg-accent",
        className,
      )}
    >
      {avatarLabel && (
        <span className="w-8 h-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
          {avatarLabel}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-foreground truncate">{title}</span>
        {subtitle && <span className="block text-xs text-muted-foreground truncate mt-0.5">{subtitle}</span>}
      </span>
      <span className="fin-amount text-sm font-bold text-foreground whitespace-nowrap">{trailing}</span>
    </Comp>
  );
}
