import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface CategoryBadgeProps {
  icon: LucideIcon;
  color: string;
  size?: "sm" | "md";
  className?: string;
}

const SIZE_CLASSES = {
  sm: { badge: "w-6 h-6", icon: "w-3 h-3" },
  md: { badge: "w-8 h-8", icon: "w-3.5 h-3.5" },
};

// Icon-in-tinted-circle badge — the same pattern the sidebar already uses
// per nav item (nav-item.tsx: w-8 h-8 rounded-full, iconClass background),
// applied to categories here. Colors are per-category/custom-category and
// therefore dynamic, so the tint is computed inline (hex + alpha suffix)
// rather than via a fixed set of Tailwind bg-*-100/dark:bg-*-500/15 classes.
export function CategoryBadge({ icon: Icon, color, size = "md", className }: CategoryBadgeProps) {
  const { badge, icon } = SIZE_CLASSES[size];
  return (
    <span
      className={cn("shrink-0 rounded-full flex items-center justify-center", badge, className)}
      style={{ backgroundColor: `${color}1a` }}
    >
      <Icon className={icon} style={{ color }} />
    </span>
  );
}
