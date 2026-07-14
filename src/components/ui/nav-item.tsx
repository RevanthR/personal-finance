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
  badge?: number;
  trailing?: ReactNode;
  /** Per-destination icon circle colors (Coin by Zerodha gives each nav
   * item its own hue rather than tinting everything with one accent) —
   * e.g. "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400". */
  iconClass?: string;
}

// Single source of truth for a nav link's active/hover/badge treatment.
// Desktop renders as a vertical tile (icon-in-circle above label, bordered
// box when active) matching Coin's sidebar; mobile stays a compact bottom
// bar item (icon above label, no border box, screen space doesn't allow it).
export function NavItem({ href, label, icon: Icon, active, variant, badge, trailing, iconClass }: NavItemProps) {
  const showBadge = !!badge && badge > 0;
  const badgeText = badge && badge > 9 ? "9+" : badge;

  if (variant === "mobile") {
    return (
      <Link
        href={href}
        className={cn(
          "flex-1 flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md text-xs transition-colors",
          active ? "text-primary" : "text-muted-foreground",
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
        "flex flex-col items-center gap-1 px-1 py-2.5 rounded-md border text-center transition-colors",
        active ? "border-primary/40 bg-accent" : "border-transparent hover:bg-muted",
      )}
    >
      <span className={cn("w-8 h-8 rounded-full flex items-center justify-center", iconClass ?? "bg-muted text-muted-foreground")}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span className={cn("text-[11px] leading-tight", active ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>
        {label}
      </span>
      {showBadge && (
        <span className="text-[10px] font-semibold text-primary bg-accent px-1.5 py-0.5 rounded-full -mt-1">
          {badge}
        </span>
      )}
      {trailing}
    </Link>
  );
}
