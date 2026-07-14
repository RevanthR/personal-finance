import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface NavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  variant: "desktop" | "mobile";
  collapsed?: boolean;
  badge?: number;
  trailing?: ReactNode;
}

// Single source of truth for a nav link's active/hover/badge treatment —
// desktop and mobile bottom-nav previously hand-maintained two separate
// blocks that had drifted apart in radius, gap, and gradient direction.
export function NavItem({ href, label, icon: Icon, active, variant, collapsed, badge, trailing }: NavItemProps) {
  const showBadge = !!badge && badge > 0;
  const badgeText = badge && badge > 9 ? "9+" : badge;

  if (variant === "mobile") {
    return (
      <Link
        href={href}
        className={cn(
          "flex-1 flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs transition-colors",
          active ? "bg-primary/10 text-primary" : "text-muted-foreground",
        )}
      >
        <span className="relative">
          <Icon className="w-5 h-5" />
          {showBadge && (
            <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center">
              {badgeText}
            </span>
          )}
        </span>
        <span className={cn("text-xs", active ? "font-semibold" : "font-medium")}>{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="relative shrink-0">
        <Icon className="w-4 h-4" />
        {collapsed && showBadge && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
            {badgeText}
          </span>
        )}
      </span>
      {!collapsed && (
        <span className="flex-1 flex items-center justify-between">
          {label}
          {showBadge && (
            <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">
              {badge}
            </span>
          )}
          {trailing}
        </span>
      )}
    </Link>
  );
}
