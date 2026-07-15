import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface NavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  variant: "desktop" | "mobile";
  /** A number renders as a count pill (e.g. pending sync items, capped at
   * "9+"); a string renders verbatim (e.g. "Pro"). Both sit top-right of
   * the icon circle, same spot, same treatment. */
  badge?: number | string;
  /** Per-destination icon circle colors (Coin by Zerodha gives each nav
   * item its own hue rather than tinting everything with one accent) —
   * e.g. "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400". */
  iconClass?: string;
}

// Single source of truth for a nav link's active/hover/badge treatment.
// Desktop renders as a vertical tile (icon-in-circle above label, filled
// background when active) matching Coin's sidebar; mobile stays a compact
// bottom bar item (icon above label, screen space doesn't allow more).
export function NavItem({ href, label, icon: Icon, active, variant, badge, iconClass }: NavItemProps) {
  const showBadge = typeof badge === "string" ? badge.length > 0 : !!badge && badge > 0;
  const badgeText = typeof badge === "number" && badge > 9 ? "9+" : badge;

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
        "flex flex-col items-center gap-1 px-0.5 py-2 rounded-md text-center transition-colors",
        active ? "bg-accent" : "hover:bg-muted",
      )}
    >
      <span className="relative">
        <span className={cn("w-8 h-8 rounded-full flex items-center justify-center", iconClass ?? "bg-muted text-muted-foreground")}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        {showBadge && (
          <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center">
            {badgeText}
          </span>
        )}
      </span>
      <span className={cn("text-[11px] leading-tight break-words", active ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>
        {label}
      </span>
    </Link>
  );
}
