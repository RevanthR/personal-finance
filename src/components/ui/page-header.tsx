import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

// Replaces the repeated (and drifting) `<h1 className="text-2xl font-bold">`
// + subtitle pattern that had a different type scale, spacing hack, or
// responsive step in nearly every page.
export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-8", className)}>
      <div>
        <h1 className="text-xl font-bold sm:text-2xl text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
