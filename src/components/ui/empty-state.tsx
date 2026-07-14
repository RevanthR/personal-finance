import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Override for full-page empty states (e.g. "set up this month") that
   * need more visual weight than the default in-list "nothing here" size. */
  titleClassName?: string;
}

// Replaces several near-identical hand-rolled empty states that had each
// independently picked a different vertical padding, icon opacity, and
// action style (an underlined inline button in one place, a proper
// Button in others).
export function EmptyState({ icon: Icon, title, description, action, className, titleClassName }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-14 px-4", className)}>
      <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className={cn("text-sm font-medium text-foreground", titleClassName)}>{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
