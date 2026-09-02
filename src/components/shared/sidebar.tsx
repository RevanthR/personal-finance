"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavItem } from "@/components/ui/nav-item";
import {
  LayoutDashboard,
  Calendar,
  CreditCard,
  Wallet,
  SlidersHorizontal,
  ShieldCheck,
  IndianRupee,
  Sparkles,
  Inbox,
} from "lucide-react";
import { useImportsBadge } from "@/lib/use-imports-badge";
import type { LucideIcon } from "lucide-react";

type NavEntry = {
  href: string;
  label: string;
  mobileLabel?: string;
  icon: LucideIcon;
  badge?: boolean;
  desktopOnly?: boolean;
  iconClass: string;
};

// Each destination gets its own icon-circle color — Coin by Zerodha gives
// every sidebar item a distinct hue rather than tinting all of them with
// one accent, a playful touch against an otherwise monochrome+blue system.
const navItems: NavEntry[] = [
  { href: "/dashboard",   label: "Dashboard",  icon: LayoutDashboard,    iconClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400" },
  { href: "/months",      label: "Year View",  mobileLabel: "Year", icon: Calendar,       iconClass: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400" },
  { href: "/cards",       label: "Cards",      icon: CreditCard,        iconClass: "bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400" },
  { href: "/receivables", label: "Vault",      icon: Wallet,            iconClass: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400" },
  // Sync is desktop-sidebar only — on mobile it lives in the header bar to
  // keep the bottom nav uncluttered (see Header).
  { href: "/imports",     label: "Sync",       icon: Inbox, badge: true, desktopOnly: true, iconClass: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400" },
  { href: "/templates",   label: "Recurring",  icon: SlidersHorizontal,  iconClass: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
];

interface SidebarProps {
  isAdmin: boolean;
  importsBadge?: number;
}

export function Sidebar({ isAdmin, importsBadge = 0 }: SidebarProps) {
  const pathname = usePathname();
  const liveImportsBadge = useImportsBadge(importsBadge);

  return (
    <>
      {/* Desktop sidebar — vertical icon-tile nav, matching Coin's sidebar.
          No collapse toggle: at this width there's nothing worth reclaiming
          by collapsing, and Coin's own sidebar doesn't have one either. */}
      <aside className="hidden md:flex flex-col border-r border-border bg-card shrink-0 w-20">
        <div className="flex items-center justify-center p-3 pb-5">
          <Link href="/dashboard" className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shrink-0">
            <IndianRupee className="w-4 h-4 text-primary-foreground" />
          </Link>
        </div>

        <nav className="flex-1 p-1.5 space-y-0.5">
          {navItems.map(({ href, label, icon, badge, iconClass }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              variant="desktop"
              active={pathname === href || pathname.startsWith(href + "/")}
              badge={badge ? liveImportsBadge : undefined}
              iconClass={iconClass}
            />
          ))}

          {/* Subscription — desktop only */}
          <NavItem
            href="/pricing"
            label="Subscription"
            icon={Sparkles}
            variant="desktop"
            active={pathname === "/pricing"}
            iconClass="bg-primary/10 text-primary"
            badge="Pro"
          />

          {isAdmin && (
            <NavItem
              href="/admin"
              label="Admin"
              icon={ShieldCheck}
              variant="desktop"
              active={pathname.startsWith("/admin")}
              iconClass="bg-muted text-muted-foreground"
            />
          )}
        </nav>
      </aside>

      {/* Mobile bottom nav — flush bar with a top border, matching Coin's
          bottom nav (no floating pill/shadow/blur). */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-around px-1 py-2">
          {navItems.filter(i => !i.desktopOnly).map(({ href, label, mobileLabel, icon }) => (
            <NavItem
              key={href}
              href={href}
              label={mobileLabel ?? label.split(" ")[0]}
              icon={icon}
              variant="mobile"
              active={pathname === href || pathname.startsWith(href + "/")}
            />
          ))}
        </div>
      </nav>
    </>
  );
}
