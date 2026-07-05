"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/months", label: "Year View", mobileLabel: "Year", icon: Calendar },
  { href: "/receivables", label: "Accounts", icon: CreditCard },
  { href: "/templates", label: "Budgets", icon: SlidersHorizontal },
  { href: "/pricing", label: "Subscription", mobileLabel: "Pro", icon: Sparkles },
];

interface SidebarProps {
  isAdmin: boolean;
}

export function Sidebar({ isAdmin }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r transition-all duration-200 shrink-0",
          "bg-[#1a2840] text-slate-100 border-[#243350]",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-[#243350]">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <IndianRupee className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight">FinanceOS</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mx-auto">
              <IndianRupee className="w-4 h-4 text-white" />
            </div>
          )}
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} className="text-slate-400 hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="mx-auto mt-2 text-slate-400 hover:text-white p-2 transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:bg-[#243350] hover:text-slate-100"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className={cn("px-3 pt-3 pb-1", collapsed && "hidden")}>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Admin</p>
              </div>
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  pathname.startsWith("/admin")
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:bg-[#243350] hover:text-slate-100"
                )}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                {!collapsed && <span>Admin Portal</span>}
              </Link>
            </>
          )}
        </nav>
      </aside>

      {/* Mobile bottom nav — floating pill, lifted above iPhone home indicator */}
      <nav className="md:hidden fixed left-4 right-4 z-50" style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-around bg-[#1a2840]/95 backdrop-blur-md rounded-2xl px-2 py-2 shadow-2xl border border-[#243350]">
          {navItems.map(({ href, label, mobileLabel, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs transition-colors",
                  active ? "bg-blue-600 text-white" : "text-slate-400"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{mobileLabel ?? label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
