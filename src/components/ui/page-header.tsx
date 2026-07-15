import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
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

// Kept in this file, not a page's loading.tsx, deliberately — a loading
// skeleton drifts the moment the real component's sizing changes unless
// it's forced to live right next to what it's approximating. Any
// loading.tsx composes this instead of hand-rolling its own title/subtitle
// Skeleton pair.
export function PageHeaderSkeleton({ hasSubtitle = true, hasAction = false, className }: { hasSubtitle?: boolean; hasAction?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-8", className)}>
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-40" />
        {hasSubtitle && <Skeleton className="h-4 w-56" />}
      </div>
      {hasAction && <Skeleton className="h-9 w-24 rounded-md" />}
    </div>
  );
}
