"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

type TrendItem = { name: string; Income: number; Expenses: number };

interface DashboardChartsProps {
  trendData: TrendItem[];
  savingsRate: number;
  expensesDelta: number | null;
  prevMonthName: string | null;
  fixedAmount: number;
  variableAmount: number;
  cashSpend: number;
  fyIncome: number;
  fyExpenses: number;
  fyBalance: number;
  monthCount: number;
}

export function DashboardCharts({
  trendData,
  savingsRate,
  expensesDelta,
  prevMonthName,
  fixedAmount,
  variableAmount,
  cashSpend,
  fyIncome,
  fyExpenses,
  fyBalance,
  monthCount,
}: DashboardChartsProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const totalFixed = fixedAmount + variableAmount;

  return (
    <div className="space-y-3">
      {/* Spending Health */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Spending Health
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Savings rate</span>
            <span
              className={cn(
                "text-sm font-semibold",
                savingsRate >= 20 ? "text-positive" : savingsRate >= 10 ? "text-warning" : "text-negative"
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
                  ? <TrendingUp className="w-3 h-3 text-negative" />
                  : <TrendingDown className="w-3 h-3 text-positive" />}
                <span className={cn("text-xs font-medium tabular-nums", expensesDelta > 0 ? "text-negative" : "text-positive")}>
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
                <span className="text-xs text-muted-foreground/60">Fixed {fmt(fixedAmount)}</span>
                <span className="text-xs text-muted-foreground/60">Variable {fmt(variableAmount)}</span>
              </div>
            </div>
          )}

          {cashSpend > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Cash / UPI spend</span>
              <span className="text-xs font-semibold tabular-nums">{fmt(cashSpend)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Trend — carries the FY summary stats that used to live in a
          separate FYSummaryCard, since both cards were built from the same
          trendData and stacking two views of one dataset was pure redundancy. */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Last {monthCount} months
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Income</p>
                <p className="text-sm font-bold text-positive tracking-tight">{fmt(fyIncome)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Expenses</p>
                <p className="text-sm font-bold text-negative tracking-tight">{fmt(fyExpenses)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">{fyBalance >= 0 ? "In hand" : "Deficit"}</p>
                <p className={cn("text-sm font-bold tracking-tight", fyBalance >= 0 ? "text-positive" : "text-negative")}>
                  {fyBalance >= 0 ? "+" : "-"}{fmt(Math.abs(fyBalance))}
                </p>
              </div>
            </div>
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

    </div>
  );
}
