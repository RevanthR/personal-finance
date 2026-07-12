"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
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
  { href: "/receivables", label: "Accounts", icon: CreditCard },
  { href: "/imports", label: "Bank Imports", mobileLabel: "Imports", icon: Inbox, badge: true },
  { href: "/templates", label: "Budgets", icon: SlidersHorizontal },
];

interface SidebarProps {
  isAdmin: boolean;
  importsBadge?: number;
}

export function Sidebar({ isAdmin, importsBadge = 0 }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  // Once per mount, not per navigation: no-ops server-side unless it's
  // been 4h+ since the last sync, but still no reason to hit it on every
  // route change. router.refresh() re-runs the server layout that computes
  // importsBadge, rather than fetching a second, independently-stale copy
  // of the same count here — that mismatch is exactly what caused the
  // badge to go stale after approving/rejecting on the imports page.
  useEffect(() => {
    fetch("/api/gmail/sync/maybe", { method: "POST" })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.ran) router.refresh(); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-gray-100 bg-white transition-all duration-200 shrink-0",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <div className="flex items-center justify-between p-4 pb-3">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center shrink-0">
                <IndianRupee className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-base tracking-tight text-gray-900">FinanceOS</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center mx-auto">
              <IndianRupee className="w-4 h-4 text-white" />
            </div>
          )}
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="mx-auto mt-2 text-gray-400 hover:text-gray-600 p-2 transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon, badge }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-gradient-to-r from-amber-500/[0.12] to-orange-500/[0.04] text-orange-700"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                )}
              >
                <span className="relative shrink-0">
                  <Icon className={cn("w-4 h-4", active ? "text-amber-600" : "")} />
                  {collapsed && badge && importsBadge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold flex items-center justify-center">
                      {importsBadge > 9 ? "9+" : importsBadge}
                    </span>
                  )}
                </span>
                {!collapsed && <span className="flex-1">{label}</span>}
                {!collapsed && badge && importsBadge > 0 && (
                  <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                    {importsBadge}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Subscription — desktop only */}
          {(() => {
            const active = pathname === "/pricing";
            return (
              <Link
                href="/pricing"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-gradient-to-r from-amber-500/[0.12] to-orange-500/[0.04] text-orange-700"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                )}
              >
                <Sparkles className={cn("w-4 h-4 shrink-0", active ? "text-amber-600" : "")} />
                {!collapsed && (
                  <span className="flex-1 flex items-center justify-between">
                    Subscription
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Pro</span>
                  </span>
                )}
              </Link>
            );
          })()}

          {isAdmin && (
            <>
              <div className={cn("px-3 pt-3 pb-1", collapsed && "hidden")}>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Admin</p>
              </div>
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  pathname.startsWith("/admin")
                    ? "bg-gradient-to-r from-amber-500/[0.12] to-orange-500/[0.04] text-orange-700"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                )}
              >
                <ShieldCheck className={cn("w-4 h-4 shrink-0", pathname.startsWith("/admin") ? "text-amber-600" : "")} />
                {!collapsed && <span>Admin Portal</span>}
              </Link>
            </>
          )}
        </nav>
      </aside>

      {/* Mobile bottom nav — floating pill, lifted above iPhone home indicator */}
      <nav className="md:hidden fixed left-3 right-3 z-50" style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-around bg-white/95 backdrop-blur-md rounded-2xl px-1 py-1.5 shadow-lg shadow-black/10 border border-gray-100">
          {navItems.map(({ href, label, mobileLabel, icon: Icon, badge }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs transition-all",
                  active
                    ? "bg-gradient-to-b from-amber-500/[0.12] to-orange-500/[0.04] text-orange-700"
                    : "text-gray-400"
                )}
              >
                <span className="relative">
                  <Icon className={cn("w-5 h-5", active ? "text-amber-600" : "")} />
                  {badge && importsBadge > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 px-1 rounded-full bg-amber-500 text-white text-[9px] font-semibold flex items-center justify-center">
                      {importsBadge > 9 ? "9+" : importsBadge}
                    </span>
                  )}
                </span>
                <span className={cn("text-xs", active ? "font-semibold" : "font-medium")}>{mobileLabel ?? label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
