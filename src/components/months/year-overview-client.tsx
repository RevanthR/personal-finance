"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { formatCurrency, cn, MONTHS } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryCard } from "@/components/ui/summary-card";
import { TabsUnderline } from "@/components/ui/tabs-underline";
import type { AnalyticsData } from "./stats-breakdown";
import { PageCoach } from "@/components/coach/page-coach";
import { Calendar, LayoutGrid, PieChart } from "lucide-react";

const StatsBreakdown = dynamic(
  () => import("./stats-breakdown").then(m => m.StatsBreakdown),
  { ssr: false, loading: () => <div className="h-64 rounded-lg bg-muted animate-pulse" /> }
);

const YearChart = dynamic(
  () => import("./year-chart").then(m => m.YearChart),
  { ssr: false, loading: () => <div className="h-52 rounded-lg border bg-muted animate-pulse" /> }
);

const CCTrendChart = dynamic(
  () => import("./cc-trend-chart").then(m => m.CCTrendChart),
  { ssr: false, loading: () => <div className="h-44 rounded-lg border bg-muted animate-pulse" /> }
);

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
                <span className="text-xs text-muted-foreground">{pct}%</span>
                <span className="text-xs font-medium">{fmt(item.value)}</span>
              </div>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary/60" style={{ width: `${(item.value / max) * 100}%` }} />
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
  ccTotal: number;
  ccByCard: { templateId: string; name: string; amount: number }[];
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
  currentMonthInsights = null,
  analyticsData,
}: {
  months: MonthData[];
  fyKey: string;
  pastFYSummaries?: PastFY[];
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

  const maxMonthValue = Math.max(...months.map(m => Math.max(m.income, m.expenses)));

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <PageCoach
        coachKey="months"
        icon={Calendar}
        iconClass="text-primary"
        bgClass="bg-accent border-primary/20"
        title="Your financial year at a glance"
        desc="April to March. Solid months are real data; dashed months are projections. Tap any past month to see its full breakdown."
      />

      <PageHeader title={fyKey} subtitle={`${actualCount} actual · ${projCount} projected`} />

      <TabsUnderline
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Overview", icon: LayoutGrid },
          { value: "breakdown", label: "Breakdown", icon: PieChart },
        ]}
      />

      {tab === "breakdown" && analyticsData && (
        <StatsBreakdown data={analyticsData} />
      )}

      {tab === "overview" && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 min-w-0 space-y-5">
            <div className="flex flex-col md:flex-row gap-4 items-stretch">
              <SummaryCard
                className="flex-1"
                tag="Projected year-end"
                stats={[
                  {
                    label: "Balance",
                    value: `${yearEndBalance >= 0 ? "+" : "−"}${fmt(Math.abs(yearEndBalance))}`,
                    valueClass: yearEndBalance >= 0 ? "text-positive" : "text-negative",
                  },
                  { label: "Income", value: fmt(totalIncome), valueClass: "text-positive" },
                  { label: "Expenses", value: fmt(totalExpenses), valueClass: "text-negative" },
                ]}
              />

              {currentMonthInsights && (
                <Card className="w-full md:w-64 shrink-0">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Savings rate (this month)</span>
                      <span className={cn(
                        "text-sm font-bold",
                        currentMonthInsights.savingsRate >= 20 ? "text-positive"
                          : currentMonthInsights.savingsRate >= 0 ? "text-warning"
                          : "text-negative"
                      )}>
                        {currentMonthInsights.savingsRate}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", currentMonthInsights.savingsRate >= 20 ? "bg-positive" : currentMonthInsights.savingsRate >= 0 ? "bg-warning" : "bg-negative")}
                        style={{ width: `${Math.max(0, Math.min(100, currentMonthInsights.savingsRate))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>In: {fmt(currentMonthInsights.totalIncome)}</span>
                      <span>Out: {fmt(currentMonthInsights.totalExpenses)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <YearChart months={months} />
            <CCTrendChart months={months} />

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Monthly breakdown
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                {months.map(m => {
                  const incPct = maxMonthValue > 0 ? Math.round((m.income / maxMonthValue) * 100) : 0;
                  const expPct = maxMonthValue > 0 ? Math.round((m.expenses / maxMonthValue) * 100) : 0;

                  const cell = (
                    <div className={cn(
                      "rounded-lg p-2.5 border select-none",
                      m.isCurrent
                        ? "bg-accent border-primary/40 ring-1 ring-primary/20"
                        : m.isPopulated
                          ? "bg-card border-border hover:border-foreground/30 transition-colors cursor-pointer"
                          : "bg-muted/50 border-dashed border-border hover:border-foreground/30 transition-colors cursor-pointer"
                    )}>
                      {/* Month + tag */}
                      <div className="flex items-center justify-between mb-2">
                        <span className={cn(
                          "text-xs font-bold",
                          m.isCurrent ? "text-primary" : "text-foreground"
                        )}>
                          {MONTHS[m.month - 1]}
                        </span>
                        <div className="flex items-center gap-0.5 flex-wrap justify-end">
                          {m.hasIncomeChange && (
                            <span className="text-xs font-bold text-positive bg-positive-bg px-1 py-0.5 rounded">↑</span>
                          )}
                          {(m.endingTemplateNames?.length ?? 0) > 0 && (
                            <span
                              title={m.endingTemplateNames?.join(", ")}
                              className="text-xs font-bold text-negative bg-negative-bg px-1 py-0.5 rounded"
                            >
                              ↓{m.endingTemplateNames!.length}
                            </span>
                          )}
                          {!m.isPopulated && (
                            <span className="text-xs font-medium text-muted-foreground bg-muted px-1 py-0.5 rounded">est</span>
                          )}
                          {m.isPopulated && !m.isCurrent && m.paid !== null && m.total !== null && (
                            <span className={cn(
                              "text-xs font-medium px-1 py-0.5 rounded",
                              m.paid === m.total ? "bg-positive-bg text-positive" : "bg-warning-bg text-warning"
                            )}>
                              {m.paid}/{m.total}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Mini income/expense bars */}
                      <div className="space-y-1 mb-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1 h-1 rounded-full bg-positive shrink-0" />
                          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-positive" style={{ width: `${incPct}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={cn("w-1 h-1 rounded-full shrink-0", expPct > 90 ? "bg-negative" : "bg-warning")} />
                          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", expPct > 90 ? "bg-negative" : "bg-warning")}
                              style={{ width: `${expPct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Balance */}
                      <p className={cn(
                        "text-xs font-bold",
                        m.balance >= 0 ? "text-positive" : "text-negative"
                      )}>
                        {m.balance >= 0 ? "+" : "−"}{fmt(Math.abs(m.balance))}
                      </p>
                      <p className="text-xs mt-0.5 text-muted-foreground">
                        {m.balance >= 0 ? "saved" : "deficit"} · {fmt(m.expenses)} spent
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

            {pastFYSummaries.length > 0 && (
              <div className="space-y-2 pt-4 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Previous years
                </p>
                {pastFYSummaries.map(fy => (
                  <div key={fy.fy} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-card">
                    <div>
                      <p className="text-sm font-medium">{fy.fy}</p>
                      <p className="text-xs text-muted-foreground">{fy.count} months</p>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "text-sm font-bold",
                        fy.balance >= 0 ? "text-positive" : "text-negative"
                      )}>
                        {fy.balance >= 0 ? "+" : "−"}{fmt(Math.abs(fy.balance))}
                      </p>
                      <p className="text-xs text-muted-foreground">{fmt(fy.income)} in</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: current month insights */}
          {currentMonthInsights && (
            <div className="w-full lg:w-80 shrink-0 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                This month
              </p>

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

              {currentMonthInsights.upcomingPayments.length > 0 && (
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold mb-2">Upcoming</p>
                    <div className="space-y-1.5">
                      {currentMonthInsights.upcomingPayments.map(p => (
                        <div key={p.name} className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-xs truncate">{p.name}</p>
                            <p className={cn("text-xs", p.overdue ? "text-negative" : "text-muted-foreground")}>
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
