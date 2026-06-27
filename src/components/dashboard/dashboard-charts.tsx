"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Calendar } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

type CategoryBreakdownItem = { key: string; name: string; value: number; color: string };
type TrendItem = { name: string; Income: number; Expenses: number };
type ChitFund = {
  id: string; isLifted: boolean; accumulatedSavings: number; liftedUsedFor: string | null;
  template: { name: string };
};

interface DashboardChartsProps {
  categoryBreakdown: CategoryBreakdownItem[];
  trendData: TrendItem[];
  chitFunds: ChitFund[];
  ccSubcatBreakdown: { name: string; amount: number }[];
  savingsRate: number;
  expensesDelta: number | null;
  prevMonthName: string | null;
  fixedAmount: number;
  variableAmount: number;
  upcomingPayments: { name: string; amount: number; dueDay: number; overdue: boolean }[];
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function RankedList({
  items,
  total,
}: {
  items: { name: string; value: number; color?: string }[];
  total: number;
}) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const max = items[0]?.value ?? 1;
  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
        const barPct = max > 0 ? (item.value / max) * 100 : 0;
        return (
          <div key={item.name}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {item.color && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: item.color, opacity: 0.75 }}
                  />
                )}
                <span className="text-xs text-foreground truncate">{item.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-[10px] text-muted-foreground">{pct}%</span>
                <span className="text-xs font-medium tabular-nums">{fmt(item.value)}</span>
              </div>
            </div>
            <div className="h-[3px] rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${barPct}%`,
                  backgroundColor: item.color ?? "#94a3b8",
                  opacity: 0.45,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardCharts({
  categoryBreakdown,
  trendData,
  chitFunds,
  ccSubcatBreakdown,
  savingsRate,
  expensesDelta,
  prevMonthName,
  fixedAmount,
  variableAmount,
  upcomingPayments,
}: DashboardChartsProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const totalSpend = categoryBreakdown.reduce((s, i) => s + i.value, 0);
  const ccTotal = ccSubcatBreakdown.reduce((s, i) => s + i.amount, 0);
  const totalFixed = fixedAmount + variableAmount;

  return (
    <div className="space-y-3">
      {/* Spending Health */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Spending Health
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Savings rate</span>
            <span
              className={cn(
                "text-sm font-semibold",
                savingsRate >= 20 ? "text-emerald-600" : savingsRate >= 10 ? "text-amber-500" : "text-rose-500"
              )}
            >
              {savingsRate}%
            </span>
          </div>

          {expensesDelta !== null && prevMonthName && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">vs {prevMonthName}</span>
              <div className="flex items-center gap-1">
                {expensesDelta > 0
                  ? <TrendingUp className="w-3 h-3 text-rose-400" />
                  : <TrendingDown className="w-3 h-3 text-emerald-500" />}
                <span className={cn("text-xs font-medium tabular-nums", expensesDelta > 0 ? "text-rose-500" : "text-emerald-600")}>
                  {expensesDelta > 0 ? "+" : "-"}{fmt(Math.abs(expensesDelta))}
                </span>
              </div>
            </div>
          )}

          {totalFixed > 0 && (
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-muted-foreground">Fixed / Variable</span>
                <span className="text-xs text-muted-foreground">
                  {Math.round((fixedAmount / totalFixed) * 100)}% / {Math.round((variableAmount / totalFixed) * 100)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted flex overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ width: `${(fixedAmount / totalFixed) * 100}%`, backgroundColor: "#94a3b8", opacity: 0.55 }}
                />
                <div className="h-full flex-1" style={{ backgroundColor: "#f59e0b", opacity: 0.35 }} />
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-[9px] text-muted-foreground/60">Fixed {fmt(fixedAmount)}</span>
                <span className="text-[9px] text-muted-foreground/60">Variable {fmt(variableAmount)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Spend */}
      {categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Top Spend
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <RankedList
              items={categoryBreakdown.map((i) => ({ name: i.name, value: i.value, color: i.color }))}
              total={totalSpend}
            />
          </CardContent>
        </Card>
      )}

      {/* CC Subcategory Breakdown */}
      {ccSubcatBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Card Spend by Type
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <RankedList
              items={ccSubcatBreakdown.map((i) => ({ name: i.name, value: i.amount }))}
              total={ccTotal}
            />
          </CardContent>
        </Card>
      )}

      {/* Upcoming Payments */}
      {upcomingPayments.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Upcoming
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {upcomingPayments.map((p) => (
              <div key={p.name} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs truncate">{p.name}</p>
                  <p className={cn("text-[10px]", p.overdue ? "text-rose-500" : "text-muted-foreground")}>
                    {p.overdue ? "Overdue" : `Due ${ordinal(p.dueDay)}`}
                  </p>
                </div>
                <span className="text-xs font-medium shrink-0 ml-2 tabular-nums">{fmt(p.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Monthly Trend */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              6-Month Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={trendData} barSize={8} barGap={2}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  formatter={(v) => fmt(Number(v))}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                <Bar dataKey="Income" fill="#86efac" radius={[2, 2, 0, 0]} opacity={0.85} />
                <Bar dataKey="Expenses" fill="#fca5a5" radius={[2, 2, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Chit Funds */}
      {chitFunds.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Chit Funds
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2.5">
            {chitFunds.map((chit) => (
              <div key={chit.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{chit.template.name}</p>
                  {chit.isLifted
                    ? <p className="text-[10px] text-muted-foreground">Lifted</p>
                    : <p className="text-[10px] text-emerald-600">Saved {fmt(chit.accumulatedSavings)}</p>
                  }
                </div>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ml-2",
                  chit.isLifted ? "bg-zinc-100 text-zinc-500" : "bg-emerald-50 text-emerald-700"
                )}>
                  {chit.isLifted ? "Lifted" : "Active"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
