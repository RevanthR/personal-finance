"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Calendar,
  TrendingUp,
  SlidersHorizontal,
  ShieldCheck,
  ChevronLeft,
  Menu,
  IndianRupee,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/months", label: "Monthly View", icon: Calendar },
  { href: "/receivables", label: "Receivables", icon: TrendingUp },
  { href: "/templates", label: "Configuration", mobileLabel: "Config", icon: SlidersHorizontal },
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
          "hidden md:flex flex-col border-r bg-slate-950 text-slate-100 transition-all duration-200 shrink-0",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-zinc-700 rounded-lg flex items-center justify-center shrink-0">
                <IndianRupee className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg">FinanceOS</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 bg-zinc-700 rounded-lg flex items-center justify-center mx-auto">
              <IndianRupee className="w-4 h-4 text-white" />
            </div>
          )}
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} className="text-slate-400 hover:text-white">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="mx-auto mt-2 text-slate-400 hover:text-white p-2"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                pathname === href || pathname.startsWith(href + "/")
                  ? "bg-zinc-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          ))}

          {isAdmin && (
            <>
              <div className={cn("px-3 py-1", collapsed && "hidden")}>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Admin</p>
              </div>
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-zinc-700 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
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
        <div className="flex items-center justify-around bg-slate-950/95 backdrop-blur-md rounded-2xl px-2 py-2 shadow-2xl border border-slate-800">
          {navItems.map(({ href, label, mobileLabel, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs transition-colors",
                  active ? "bg-zinc-700 text-white" : "text-slate-500"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{mobileLabel ?? label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
