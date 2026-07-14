"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { NavItem } from "@/components/ui/nav-item";
import {
  LayoutDashboard,
  Calendar,
  CreditCard,
  SlidersHorizontal,
  ShieldCheck,
  ChevronLeft,
  Menu,
  IndianRupee,
  Sparkles,
  Inbox,
} from "lucide-react";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/months", label: "Year View", mobileLabel: "Year", icon: Calendar },
  { href: "/receivables", label: "Vault", icon: CreditCard },
  { href: "/imports", label: "Sync", icon: Inbox, badge: true },
  { href: "/templates", label: "Recurring", icon: SlidersHorizontal },
];

interface SidebarProps {
  isAdmin: boolean;
  importsBadge?: number;
}

export function Sidebar({ isAdmin, importsBadge = 0 }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  // The sidebar (and its badge count) is present on every authenticated
  // page, but sync now happens silently in the background via push
  // notifications — nothing tells the client it happened. Present here
  // (not just on /imports) so the badge stays live regardless of which
  // page you're on when a background sync lands.
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 20_000);
    const onFocus = () => router.refresh();
    const onVisibilityChange = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-card transition-all duration-200 shrink-0",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <div className="flex items-center justify-between p-4 pb-3">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shrink-0">
                <IndianRupee className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-base tracking-tight text-foreground">FinanceOS</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center mx-auto">
              <IndianRupee className="w-4 h-4 text-primary-foreground" />
            </div>
          )}
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="mx-auto mt-2 text-muted-foreground hover:text-foreground p-2 transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(({ href, label, icon, badge }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              variant="desktop"
              collapsed={collapsed}
              active={pathname === href || pathname.startsWith(href + "/")}
              badge={badge ? importsBadge : undefined}
            />
          ))}

          {/* Subscription — desktop only */}
          <NavItem
            href="/pricing"
            label="Subscription"
            icon={Sparkles}
            variant="desktop"
            collapsed={collapsed}
            active={pathname === "/pricing"}
            trailing={<span className="text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">Pro</span>}
          />

          {isAdmin && (
            <>
              <div className={cn("px-3 pt-3 pb-1", collapsed && "hidden")}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Admin</p>
              </div>
              <NavItem
                href="/admin"
                label="Admin Portal"
                icon={ShieldCheck}
                variant="desktop"
                collapsed={collapsed}
                active={pathname.startsWith("/admin")}
              />
            </>
          )}
        </nav>
      </aside>

      {/* Mobile bottom nav — floating pill, lifted above iPhone home indicator */}
      <nav className="md:hidden fixed left-3 right-3 z-50" style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-around bg-card/95 backdrop-blur-md rounded-2xl px-1 py-1.5 shadow-lg shadow-black/10 border border-border">
          {navItems.map(({ href, label, mobileLabel, icon, badge }) => (
            <NavItem
              key={href}
              href={href}
              label={mobileLabel ?? label.split(" ")[0]}
              icon={icon}
              variant="mobile"
              active={pathname === href || pathname.startsWith(href + "/")}
              badge={badge ? importsBadge : undefined}
            />
          ))}
        </div>
      </nav>
    </>
  );
}
