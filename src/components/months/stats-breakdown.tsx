"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, CATEGORY_COLORS } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";

const TrendChart = dynamic(() => import("./stats-charts").then(m => m.TrendChart), {
  ssr: false,
  loading: () => <div className="h-40 rounded-lg bg-muted animate-pulse" />,
});
const IncomeChart = dynamic(() => import("./stats-charts").then(m => m.IncomeChart), {
  ssr: false,
  loading: () => <div className="h-40 rounded-lg bg-muted animate-pulse" />,
});

export type AnalyticsData = {
  fyExpenses: number;
  fyIncome: number;
  actualMonthCount: number;
  spendByCategory: {
    key: string;
    name: string;
    color: string;
    total: number;
    pct: number;
    items: { name: string; total: number; months: number }[];
  }[];
  recurringTotal: number;
  adHocExpenseTotal: number;
  essentialTotal: number;
  lifestyleTotal: number;
  committedOverhead: number;
  monthlyTrends: {
    label: string;
    income: number;
    expenses: number;
    balance: number;
    savingsRate: number;
    salary: number;
    freelance: number;
    other: number;
    adHocIncome: number;
  }[];
  loans: {
    name: string;
    monthlyAmount: number;
    endsMonth: number | null;
    endsYear: number | null;
    remainingMonths: number | null;
    totalRemaining: number | null;
  }[];
  chits: {
    name: string;
    monthlyAmount: number;
    totalValue: number;
    accumulated: number;
    isLifted: boolean;
    endsMonth: number;
    endsYear: number;
    remainingMonths: number;
    durationMonths: number;
    startMonth: number;
    startYear: number;
  }[];
  currentMonthlyCommitted: number;
  reliefMilestones: {
    month: number;
    year: number;
    label: string;
    monthsFromNow: number;
    items: { name: string; type: "LOAN" | "CHIT"; monthlyRelief: number }[];
    totalRelief: number;
    committedAfter: number;
  }[];
  ccAnnualSubcats: { name: string; amount: number }[];
  bestMonth: { label: string; savingsRate: number; balance: number } | null;
  worstMonth: { label: string; savingsRate: number; balance: number } | null;
  prevFYLabel: string | null;
  prevFYSpendByCategory: { key: string; name: string; total: number }[];
  avgMonthlyIncome: number;
  freelancePct: number;
  incomeSources: { salary: number; freelance: number; other: number; adHoc: number };
};

const MONTHS_FULL = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden flex-1">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, backgroundColor: color, opacity: 0.7 }} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">{children}</p>;
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums", color ?? "text-foreground")}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function CategorySection({ data, totalExpenses, fmt }: {
  data: AnalyticsData["spendByCategory"];
  totalExpenses: number;
  fmt: (v: number) => string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!data.length) return <p className="text-sm text-muted-foreground">No spending data yet.</p>;
  const max = data[0].total;

  return (
    <div className="space-y-1">
      {data.map(cat => (
        <div key={cat.key}>
          <button
            onClick={() => setExpanded(expanded === cat.key ? null : cat.key)}
            className="w-full text-left"
          >
            <div className="flex items-center gap-2 py-2 px-3 rounded-xl hover:bg-zinc-50 transition-colors group">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-sm font-medium flex-1 min-w-0 truncate">{cat.name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{cat.pct}%</span>
              <span className="text-sm font-semibold shrink-0 tabular-nums">{fmt(cat.total)}</span>
              {cat.items.length > 0 && (
                expanded === cat.key
                  ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
            <div className="px-3 pb-1">
              <Bar value={cat.total} max={max} color={cat.color} />
            </div>
          </button>

          {expanded === cat.key && cat.items.length > 0 && (
            <div className="ml-5 mr-3 mb-2 space-y-1 border-l-2 pl-3" style={{ borderColor: cat.color + "44" }}>
              {cat.items.map(item => (
                <div key={item.name} className="flex items-center justify-between py-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.months} month{item.months !== 1 ? "s" : ""} · avg {fmt(Math.round(item.total / item.months))}/mo
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-xs font-semibold tabular-nums">{fmt(item.total)}</p>
                    <p className="text-[10px] text-muted-foreground">{pct(item.total, totalExpenses)}% of spend</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SavingsRateBar({ trends, fmt }: {
  trends: AnalyticsData["monthlyTrends"];
  fmt: (v: number) => string;
}) {
  if (!trends.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  const max = Math.max(...trends.map(t => Math.abs(t.balance)), 1);

  return (
    <div className="space-y-2.5">
      {trends.map(t => (
        <div key={t.label} className="flex items-center gap-2.5">
          <span className="text-xs text-muted-foreground w-8 shrink-0">{t.label}</span>
          <div className="flex-1 h-5 rounded-lg bg-zinc-50 border border-zinc-100 overflow-hidden relative">
            <div
              className={cn("h-full rounded-md transition-all duration-500", t.balance >= 0 ? "bg-green-400" : "bg-red-400")}
              style={{ width: `${(Math.abs(t.balance) / max) * 100}%`, opacity: 0.7 }}
            />
          </div>
          <span className={cn("text-xs font-semibold tabular-nums w-14 text-right shrink-0", t.savingsRate >= 20 ? "text-green-600" : t.savingsRate >= 0 ? "text-amber-600" : "text-red-600")}>
            {t.savingsRate}%
          </span>
          <span className="text-xs text-muted-foreground tabular-nums w-20 text-right shrink-0 hidden sm:block">
            {fmt(t.balance)}
          </span>
        </div>
      ))}
    </div>
  );
}

function RelativeTime({ months }: { months: number }) {
  if (months === 0) return <span className="text-amber-600 font-medium">this month</span>;
  if (months < 12) return <span>{months}mo away</span>;
  const y = Math.floor(months / 12), m = months % 12;
  return <span>{y}yr{m > 0 ? ` ${m}mo` : ""} away</span>;
}

function ReliefTimeline({ data, fmt }: {
  data: AnalyticsData;
  fmt: (v: number) => string;
}) {
  const { loans, chits, reliefMilestones, currentMonthlyCommitted } = data;
  const hasAny = loans.length > 0 || chits.some(c => c.remainingMonths > 0);
  if (!hasAny) return null;

  const lastMilestone = reliefMilestones[reliefMilestones.length - 1];

  return (
    <div className="space-y-3">
      {/* Current committed header */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border bg-red-50 border-red-100 p-3">
          <p className="text-[10px] text-red-700 uppercase tracking-wider mb-0.5">Monthly committed</p>
          <p className="text-lg font-bold text-red-700 tabular-nums">{fmt(currentMonthlyCommitted)}</p>
          <p className="text-[10px] text-red-600">{loans.length} loan{loans.length !== 1 ? "s" : ""} · {chits.filter(c => c.remainingMonths > 0).length} chit{chits.filter(c => c.remainingMonths > 0).length !== 1 ? "s" : ""}</p>
        </div>
        {lastMilestone && (
          <div className="rounded-xl border bg-green-50 border-green-100 p-3">
            <p className="text-[10px] text-green-700 uppercase tracking-wider mb-0.5">After all clear</p>
            <p className="text-lg font-bold text-green-700 tabular-nums">{fmt(Math.max(0, lastMilestone.committedAfter))}</p>
            <p className="text-[10px] text-green-600">by {lastMilestone.label}</p>
          </div>
        )}
      </div>

      {/* Milestone timeline */}
      {reliefMilestones.length > 0 && (
        <div className="space-y-1.5">
          {reliefMilestones.map((ms, i) => (
            <div key={ms.label} className="relative rounded-xl border bg-card px-4 py-3">
              {/* Left accent line */}
              <div className={cn(
                "absolute left-0 top-0 bottom-0 w-1 rounded-l-xl",
                ms.items.some(x => x.type === "LOAN") && ms.items.some(x => x.type === "CHIT")
                  ? "bg-gradient-to-b from-red-400 to-indigo-400"
                  : ms.items[0].type === "LOAN" ? "bg-red-400" : "bg-indigo-400"
              )} />
              <div className="flex items-start justify-between gap-3 pl-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-bold">{ms.label}</p>
                    <span className="text-[10px] text-muted-foreground"><RelativeTime months={ms.monthsFromNow} /></span>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {ms.items.map(item => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <span className={cn(
                          "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                          item.type === "LOAN" ? "bg-red-400" : "bg-indigo-400"
                        )} />
                        <span className="text-xs text-muted-foreground">{item.name}</span>
                        <span className="text-[10px] text-muted-foreground">({item.type === "LOAN" ? "loan" : "chit"})</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-green-600">-{fmt(ms.totalRelief)}/mo</p>
                  <p className="text-[10px] text-muted-foreground">→ {fmt(Math.max(0, ms.committedAfter))}/mo</p>
                </div>
              </div>
              {/* Mini progress: how close to this milestone */}
              {ms.monthsFromNow > 0 && i === 0 && (
                <div className="mt-2 pl-1">
                  <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all"
                      style={{ width: `${Math.min(100, Math.round((1 - ms.monthsFromNow / 24) * 100))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
          {/* Debt-free footer */}
          {lastMilestone && (
            <div className="rounded-xl border border-dashed border-green-300 bg-green-50 px-4 py-2.5 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <p className="text-xs text-green-700 font-medium">All commitments clear after {lastMilestone.label} · monthly relief of {fmt(currentMonthlyCommitted - Math.max(0, lastMilestone.committedAfter))}</p>
            </div>
          )}
        </div>
      )}

      {/* Individual items with no end date */}
      {loans.filter(l => !l.endsYear).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">No end date set</p>
          {loans.filter(l => !l.endsYear).map(l => (
            <div key={l.name} className="rounded-xl border bg-card px-4 py-2.5 flex justify-between items-center">
              <p className="text-sm">{l.name}</p>
              <p className="text-xs text-muted-foreground">{fmt(l.monthlyAmount)}/mo</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function YoYSection({ current, prev, prevLabel, fmt }: {
  current: AnalyticsData["spendByCategory"];
  prev: AnalyticsData["prevFYSpendByCategory"];
  prevLabel: string;
  fmt: (v: number) => string;
}) {
  const prevMap = new Map(prev.map(p => [p.key, p.total]));
  const cats = current.map(c => {
    const prevTotal = prevMap.get(c.key) ?? 0;
    const delta = prevTotal > 0 ? Math.round(((c.total - prevTotal) / prevTotal) * 100) : null;
    return { ...c, prevTotal, delta };
  }).filter(c => c.prevTotal > 0 || c.total > 0).slice(0, 6);

  if (!cats.length) return <p className="text-sm text-muted-foreground">Not enough history to compare.</p>;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 text-[10px] text-muted-foreground px-1 mb-1">
        <span className="col-span-2">Category</span>
        <span className="text-right">{prevLabel}</span>
        <span className="text-right">This FY</span>
      </div>
      {cats.map(c => (
        <div key={c.key} className="grid grid-cols-4 items-center gap-1 px-1 py-1.5 rounded-lg hover:bg-zinc-50">
          <div className="col-span-2 flex items-center gap-1.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
            <span className="text-xs truncate">{c.name}</span>
            {c.delta !== null && (
              <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded", c.delta > 10 ? "text-red-600 bg-red-50" : c.delta < -10 ? "text-green-600 bg-green-50" : "text-zinc-500 bg-zinc-100")}>
                {c.delta > 0 ? "+" : ""}{c.delta}%
              </span>
            )}
          </div>
          <span className="text-xs text-right text-muted-foreground tabular-nums">{fmt(c.prevTotal)}</span>
          <span className="text-xs text-right font-semibold tabular-nums">{fmt(c.total)}</span>
        </div>
      ))}
    </div>
  );
}

export function StatsBreakdown({ data }: { data: AnalyticsData }) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);

  const avgMonthlySpend = data.actualMonthCount > 0
    ? Math.round(data.fyExpenses / data.actualMonthCount) : 0;
  const avgSavingsRate = data.monthlyTrends.length > 0
    ? Math.round(data.monthlyTrends.reduce((s, m) => s + m.savingsRate, 0) / data.monthlyTrends.length) : 0;
  const recurringPct = data.fyExpenses > 0 ? pct(data.recurringTotal, data.fyExpenses) : 0;
  const essentialPct = pct(data.essentialTotal, data.fyExpenses);
  const lifestylePct = pct(data.lifestyleTotal, data.fyExpenses);

  if (data.actualMonthCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground text-sm">No actual months recorded yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Set up your first month to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Summary cards — always full width */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="FY Spend" value={fmt(data.fyExpenses)} sub={`${data.actualMonthCount} months`} color="text-red-600" />
        <StatCard label="Avg / month" value={fmt(avgMonthlySpend)} />
        <StatCard label="FY Income" value={fmt(data.fyIncome)} color="text-green-600" />
        <StatCard label="Avg savings" value={`${avgSavingsRate}%`} color={avgSavingsRate >= 20 ? "text-green-600" : avgSavingsRate >= 10 ? "text-amber-600" : "text-red-600"} />
      </div>

      {/* 2-column grid on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:items-start">

        {/* ── Left column ── */}
        <div className="space-y-5">

          {/* Where your money went */}
          <div>
            <SectionTitle>Where your money went</SectionTitle>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <CategorySection data={data.spendByCategory} totalExpenses={data.fyExpenses} fmt={fmt} />
              </CardContent>
            </Card>
          </div>

          {/* Spending character */}
          <div>
            <SectionTitle>Spending character</SectionTitle>
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Recurring</p>
                    <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-400" style={{ width: `${recurringPct}%` }} />
                    </div>
                    <p className="text-xs font-semibold">{recurringPct}%</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">One-off</p>
                    <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${100 - recurringPct}%` }} />
                    </div>
                    <p className="text-xs font-semibold">{100 - recurringPct}%</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Essential</p>
                    <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                      <div className="h-full rounded-full bg-slate-500" style={{ width: `${essentialPct}%` }} />
                    </div>
                    <p className="text-xs font-semibold">{essentialPct}%</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Lifestyle</p>
                    <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                      <div className="h-full rounded-full bg-pink-400" style={{ width: `${lifestylePct}%` }} />
                    </div>
                    <p className="text-xs font-semibold">{lifestylePct}%</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                  Committed overhead <span className="font-semibold text-foreground">{fmt(data.committedOverhead)}/mo</span>
                  <span className="mx-1.5">·</span>
                  Essential = Loan, Maintenance, Savings
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Chit funds */}
          {data.chits.length > 0 && (
            <div>
              <SectionTitle>Chit fund progress</SectionTitle>
              <div className="space-y-2">
                {data.chits.map(c => {
                  const elapsed = c.durationMonths - c.remainingMonths;
                  const progressPct = c.durationMonths > 0 ? Math.round((elapsed / c.durationMonths) * 100) : 100;
                  return (
                    <div key={c.name} className="rounded-xl border bg-card px-4 py-3">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{fmt(c.monthlyAmount)}/mo · pot {fmt(c.totalValue)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          {c.remainingMonths === 0 ? (
                            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">Done</span>
                          ) : (
                            <>
                              <p className="text-xs font-semibold">ends {MONTHS_FULL[c.endsMonth - 1]} {c.endsYear}</p>
                              <p className="text-[10px] text-muted-foreground">{c.remainingMonths} mo left</p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${progressPct}%` }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-muted-foreground">{fmt(c.accumulated)} saved</span>
                        <span className="text-[10px] text-muted-foreground">{progressPct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-5">

          {/* Monthly savings trend */}
          <div>
            <SectionTitle>Monthly savings trend</SectionTitle>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <SavingsRateBar trends={data.monthlyTrends} fmt={fmt} />
                {(data.bestMonth || data.worstMonth) && data.bestMonth?.label !== data.worstMonth?.label && (
                  <div className="flex gap-4 mt-3 pt-3 border-t border-border">
                    {data.bestMonth && (
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        <p className="text-xs"><span className="text-muted-foreground">Best </span><span className="font-semibold">{data.bestMonth.label} {data.bestMonth.savingsRate}%</span></p>
                      </div>
                    )}
                    {data.worstMonth && (
                      <div className="flex items-center gap-1.5">
                        <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <p className="text-xs"><span className="text-muted-foreground">Worst </span><span className="font-semibold">{data.worstMonth.label} {data.worstMonth.savingsRate}%</span></p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Income breakdown */}
          {data.monthlyTrends.length > 0 && (
            <div>
              <SectionTitle>Income by source</SectionTitle>
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
                    <div><span className="text-[10px] text-muted-foreground">Salary </span><span className="text-xs font-semibold text-emerald-600">{fmt(data.incomeSources.salary)}</span></div>
                    {data.incomeSources.freelance > 0 && <div><span className="text-[10px] text-muted-foreground">Freelance </span><span className="text-xs font-semibold text-cyan-600">{fmt(data.incomeSources.freelance)}</span><span className="text-[9px] text-muted-foreground ml-1">({data.freelancePct}%)</span></div>}
                    {data.incomeSources.other > 0 && <div><span className="text-[10px] text-muted-foreground">Other </span><span className="text-xs font-semibold">{fmt(data.incomeSources.other)}</span></div>}
                    {data.incomeSources.adHoc > 0 && <div><span className="text-[10px] text-muted-foreground">One-off </span><span className="text-xs font-semibold text-violet-600">{fmt(data.incomeSources.adHoc)}</span></div>}
                  </div>
                  <IncomeChart data={data.monthlyTrends} />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Relief timeline — when expenses will drop */}
          {(data.loans.length > 0 || data.chits.some(c => c.remainingMonths > 0)) && (
            <div>
              <SectionTitle>When does it get lighter?</SectionTitle>
              <ReliefTimeline data={data} fmt={fmt} />
            </div>
          )}

          {/* CC annual subcats */}
          {data.ccAnnualSubcats.length > 0 && (
            <div>
              <SectionTitle>Card spend by type</SectionTitle>
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="space-y-2">
                    {(() => {
                      const total = data.ccAnnualSubcats.reduce((s, i) => s + i.amount, 0);
                      const max = data.ccAnnualSubcats[0]?.amount ?? 1;
                      return data.ccAnnualSubcats.map(item => (
                        <div key={item.name}>
                          <div className="flex justify-between mb-0.5">
                            <span className="text-xs">{item.name}</span>
                            <div className="flex gap-2">
                              <span className="text-[10px] text-muted-foreground">{pct(item.amount, total)}%</span>
                              <span className="text-xs font-semibold tabular-nums">{fmt(item.amount)}</span>
                            </div>
                          </div>
                          <Bar value={item.amount} max={max} color={CATEGORY_COLORS.CREDIT_CARD} />
                        </div>
                      ));
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* YoY — full width below the grid */}
      {data.prevFYLabel && data.prevFYSpendByCategory.length > 0 && (
        <div>
          <SectionTitle>vs {data.prevFYLabel}</SectionTitle>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <YoYSection
                current={data.spendByCategory}
                prev={data.prevFYSpendByCategory}
                prevLabel={data.prevFYLabel}
                fmt={fmt}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
