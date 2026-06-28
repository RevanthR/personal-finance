"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import type { AnalyticsData } from "./stats-breakdown";

const StatsBreakdown = dynamic(
  () => import("./stats-breakdown").then(m => m.StatsBreakdown),
  { ssr: false, loading: () => <div className="h-64 rounded-xl bg-muted animate-pulse" /> }
);

const YearChart = dynamic(
  () => import("./year-chart").then(m => m.YearChart),
  { ssr: false, loading: () => <div className="h-52 rounded-xl border bg-muted animate-pulse" /> }
);

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function ordinal(n: number) {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function RankedList({ items, total }: { items: { name: string; value: number; color?: string }[]; total: number }) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const max = items[0]?.value ?? 1;
  return (
    <div className="space-y-2">
      {items.map(item => {
        const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
        return (
          <div key={item.name}>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                {item.color && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: item.color }} />}
                <span className="text-xs text-foreground truncate">{item.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-muted-foreground">{pct}%</span>
                <span className="text-xs font-medium">{hidden ? "••••" : `₹${(item.value / 1000).toFixed(1)}k`}</span>
              </div>
            </div>
            <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
              <div className="h-full rounded-full bg-zinc-400" style={{ width: `${(item.value / max) * 100}%`, opacity: 0.6 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type MonthData = {
  id: string | null;
  month: number;
  year: number;
  income: number;
  expenses: number;
  balance: number;
  paid: number | null;
  total: number | null;
  isPopulated: boolean;
  isCurrent: boolean;
  hasIncomeChange?: boolean;
  endingTemplateNames?: string[];
};

type PastFY = {
  fy: string;
  income: number;
  expenses: number;
  balance: number;
  count: number;
};

type InsightData = {
  categoryBreakdown: { key: string; name: string; value: number; color: string }[];
  ccSubcatBreakdown: { name: string; amount: number }[];
  savingsRate: number;
  totalIncome: number;
  totalExpenses: number;
  upcomingPayments: { name: string; amount: number; dueDay: number; overdue: boolean }[];
} | null;

export function YearOverviewClient({
  months,
  fyKey,
  pastFYSummaries = [],
  incomeTemplateCount = 0,
  currentMonthInsights = null,
  analyticsData,
}: {
  months: MonthData[];
  fyKey: string;
  pastFYSummaries?: PastFY[];
  incomeTemplateCount?: number;
  currentMonthInsights?: InsightData;
  analyticsData?: AnalyticsData;
}) {
  const [tab, setTab] = useState<"overview" | "breakdown">("overview");
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const totalIncome   = months.reduce((s, m) => s + m.income, 0);
  const totalExpenses = months.reduce((s, m) => s + m.expenses, 0);
  const yearEndBalance = totalIncome - totalExpenses;
  const actualCount   = months.filter(m => m.isPopulated).length;
  const projCount     = 12 - actualCount;

  const maxMonthIncome = Math.max(...months.map(m => m.income));

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* Header + tabs — always visible */}
      <div>
        <h1 className="text-xl font-bold">{fyKey}</h1>
        <p className="text-sm text-muted-foreground">
          {actualCount} actual · {projCount} projected
        </p>
        <div className="flex gap-1 mt-3 bg-zinc-100 rounded-xl p-1 w-fit">
          {(["overview", "breakdown"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                tab === t ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "overview" ? "Overview" : "Breakdown"}
            </button>
          ))}
        </div>
      </div>

      {/* Breakdown tab — full width */}
      {tab === "breakdown" && analyticsData && (
        <StatsBreakdown data={analyticsData} />
      )}

      {/* Overview tab — sidebar layout capped at 5xl */}
      {tab === "overview" && (
      <div className="flex flex-col lg:flex-row gap-6 max-w-5xl lg:items-start">
    <div className="flex-1 min-w-0 space-y-5">
      {tab === "overview" && <>

      {/* Year-end projection */}
      <Card className={cn(
        "border-2",
        yearEndBalance >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
      )}>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Projected year-end
          </p>
          <p className={cn(
            "text-3xl font-bold tracking-tight",
            yearEndBalance >= 0 ? "text-green-700" : "text-red-700"
          )}>
            {yearEndBalance >= 0 ? "+" : "−"}{fmt(Math.abs(yearEndBalance))}
          </p>
          <div className="flex gap-5 mt-2.5 text-xs">
            <div>
              <span className="text-muted-foreground">Income  </span>
              <span className="text-green-700 font-semibold">{fmt(totalIncome)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Expenses  </span>
              <span className="text-red-700 font-semibold">{fmt(totalExpenses)}</span>
            </div>
          </div>
          {projCount > 0 && incomeTemplateCount > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Projection from {incomeTemplateCount} income template{incomeTemplateCount !== 1 ? "s" : ""}
            </p>
          )}
          {projCount > 0 && incomeTemplateCount === 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">Projection at current run rate</p>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      <YearChart months={months} />

      {/* Monthly grid */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Monthly breakdown
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {months.map(m => {
            const expPct = m.income > 0 ? Math.min(100, Math.round((m.expenses / m.income) * 100)) : 0;
            const incPct = maxMonthIncome > 0 ? Math.round((m.income / maxMonthIncome) * 100) : 100;

            const cell = (
              <div className={cn(
                "rounded-xl p-2.5 border select-none",
                m.isCurrent
                  ? "bg-green-50 border-green-400 ring-1 ring-green-300"
                  : m.isPopulated
                    ? "bg-card border-border hover:border-zinc-400 transition-colors cursor-pointer"
                    : "bg-zinc-50 border-dashed border-zinc-200 hover:border-zinc-400 transition-colors cursor-pointer"
              )}>
                {/* Month + tag */}
                <div className="flex items-center justify-between mb-2">
                  <span className={cn(
                    "text-xs font-bold",
                    m.isCurrent ? "text-green-800" : "text-foreground"
                  )}>
                    {MONTHS[m.month - 1]}
                  </span>
                  <div className="flex items-center gap-0.5 flex-wrap justify-end">
                    {m.hasIncomeChange && (
                      <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded">↑</span>
                    )}
                    {(m.endingTemplateNames?.length ?? 0) > 0 && (
                      <span
                        title={m.endingTemplateNames?.join(", ")}
                        className="text-[8px] font-bold text-rose-600 bg-rose-50 px-1 py-0.5 rounded"
                      >
                        ↓{m.endingTemplateNames!.length}
                      </span>
                    )}
                    {!m.isPopulated && (
                      <span className="text-[8px] font-medium text-muted-foreground bg-zinc-200 px-1 py-0.5 rounded">est</span>
                    )}
                    {m.isPopulated && !m.isCurrent && m.paid !== null && m.total !== null && (
                      <span className={cn(
                        "text-[8px] font-medium px-1 py-0.5 rounded",
                        m.paid === m.total ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {m.paid}/{m.total}
                      </span>
                    )}
                  </div>
                </div>

                {/* Mini income/expense bars */}
                <div className="space-y-1 mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-green-500 shrink-0" />
                    <div className="flex-1 h-1 rounded-full bg-zinc-200 overflow-hidden">
                      <div className="h-full rounded-full bg-green-500" style={{ width: `${incPct}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={cn("w-1 h-1 rounded-full shrink-0", expPct > 90 ? "bg-red-500" : "bg-orange-400")} />
                    <div className="flex-1 h-1 rounded-full bg-zinc-200 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", expPct > 90 ? "bg-red-500" : "bg-orange-400")}
                        style={{ width: `${expPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Balance */}
                <p className={cn(
                  "text-xs font-bold",
                  m.balance >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {m.balance >= 0 ? "+" : "−"}{fmt(Math.abs(m.balance))}
                </p>
                <p className="text-[9px] mt-0.5 text-muted-foreground">
                  {fmt(m.expenses)} spent
                </p>
              </div>
            );

            const href = m.isPopulated && m.id
              ? `/months/${m.id}`
              : m.isCurrent
                ? "/dashboard"
                : `/dashboard?month=${m.month}&year=${m.year}`;

            return (
              <Link key={`${m.year}-${m.month}`} href={href}>{cell}</Link>
            );
          })}
        </div>
      </div>

      {/* Past FYs */}
      {pastFYSummaries.length > 0 && (
        <div className="space-y-2 pt-4 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Previous years
          </p>
          {pastFYSummaries.map(fy => (
            <div key={fy.fy} className="flex items-center justify-between px-3 py-2.5 rounded-xl border bg-card">
              <div>
                <p className="text-sm font-medium">{fy.fy}</p>
                <p className="text-[10px] text-muted-foreground">{fy.count} months</p>
              </div>
              <div className="text-right">
                <p className={cn(
                  "text-sm font-bold",
                  fy.balance >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {fy.balance >= 0 ? "+" : "−"}{fmt(Math.abs(fy.balance))}
                </p>
                <p className="text-[10px] text-muted-foreground">{fmt(fy.income)} in</p>
              </div>
            </div>
          ))}
        </div>
      )}
      </>}
    </div>

    {/* ── Right: Current month insights ── */}
    {tab === "overview" && currentMonthInsights && (
      <div className="w-full lg:w-72 shrink-0 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          This month
        </p>

        {/* Savings health */}
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Savings rate</span>
              <span className={cn(
                "text-sm font-bold",
                currentMonthInsights.savingsRate >= 20 ? "text-green-600"
                  : currentMonthInsights.savingsRate >= 0 ? "text-amber-600"
                  : "text-red-600"
              )}>
                {currentMonthInsights.savingsRate}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", currentMonthInsights.savingsRate >= 20 ? "bg-green-500" : currentMonthInsights.savingsRate >= 0 ? "bg-amber-500" : "bg-red-500")}
                style={{ width: `${Math.max(0, Math.min(100, currentMonthInsights.savingsRate))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>In: {fmt(currentMonthInsights.totalIncome)}</span>
              <span>Out: {fmt(currentMonthInsights.totalExpenses)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Top spending categories */}
        {currentMonthInsights.categoryBreakdown.length > 0 && (
          <Card>
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-2.5">Top spend</p>
              <RankedList
                items={currentMonthInsights.categoryBreakdown}
                total={currentMonthInsights.totalExpenses}
              />
            </CardContent>
          </Card>
        )}

        {/* CC subcategory breakdown */}
        {currentMonthInsights.ccSubcatBreakdown.length > 0 && (
          <Card>
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-2.5">Card spend by type</p>
              <RankedList
                items={currentMonthInsights.ccSubcatBreakdown.map(i => ({ name: i.name, value: i.amount }))}
                total={currentMonthInsights.ccSubcatBreakdown.reduce((s, i) => s + i.amount, 0)}
              />
            </CardContent>
          </Card>
        )}

        {/* Upcoming unpaid entries */}
        {currentMonthInsights.upcomingPayments.length > 0 && (
          <Card>
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-2">Upcoming</p>
              <div className="space-y-1.5">
                {currentMonthInsights.upcomingPayments.map(p => (
                  <div key={p.name} className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-xs truncate">{p.name}</p>
                      <p className={cn("text-[10px]", p.overdue ? "text-red-500" : "text-muted-foreground")}>
                        {p.overdue ? "overdue" : `due ${ordinal(p.dueDay)}`}
                      </p>
                    </div>
                    <span className="text-xs font-medium shrink-0 ml-2">
                      {fmt(p.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )}
    </div>
    )}
    </div>
  );
}
