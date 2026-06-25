"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

const YearChart = dynamic(
  () => import("./year-chart").then(m => m.YearChart),
  { ssr: false, loading: () => <div className="h-52 rounded-xl border bg-muted animate-pulse" /> }
);

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

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
};

type PastFY = {
  fy: string;
  income: number;
  expenses: number;
  balance: number;
  count: number;
};

export function YearOverviewClient({
  months,
  fyKey,
  pastFYSummaries = [],
}: {
  months: MonthData[];
  fyKey: string;
  pastFYSummaries?: PastFY[];
}) {
  const totalIncome   = months.reduce((s, m) => s + m.income, 0);
  const totalExpenses = months.reduce((s, m) => s + m.expenses, 0);
  const yearEndBalance = totalIncome - totalExpenses;
  const actualCount   = months.filter(m => m.isPopulated).length;
  const projCount     = 12 - actualCount;

  const maxMonthIncome = Math.max(...months.map(m => m.income));

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">{fyKey}</h1>
        <p className="text-sm text-muted-foreground">
          {actualCount} actual · {projCount} projected
        </p>
      </div>

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
            {yearEndBalance >= 0 ? "+" : "−"}{formatCurrency(Math.abs(yearEndBalance))}
          </p>
          <div className="flex gap-5 mt-2.5 text-xs">
            <div>
              <span className="text-muted-foreground">Income  </span>
              <span className="text-green-700 font-semibold">{formatCurrency(totalIncome)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Expenses  </span>
              <span className="text-red-700 font-semibold">{formatCurrency(totalExpenses)}</span>
            </div>
          </div>
          {projCount > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              {actualCount} month{actualCount !== 1 ? "s" : ""} actual · {projCount} estimated at current run rate
            </p>
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
                    : "bg-zinc-50 border-dashed border-zinc-200"
              )}>
                {/* Month + tag */}
                <div className="flex items-center justify-between mb-2">
                  <span className={cn(
                    "text-xs font-bold",
                    m.isCurrent ? "text-green-800" : "text-foreground"
                  )}>
                    {MONTHS[m.month - 1]}
                  </span>
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
                  {m.balance >= 0 ? "+" : "−"}{formatCurrency(Math.abs(m.balance))}
                </p>
                <p className="text-[9px] mt-0.5 text-muted-foreground">
                  {formatCurrency(m.expenses)} spent
                </p>
              </div>
            );

            return m.isPopulated && m.id ? (
              <Link key={`${m.year}-${m.month}`} href={`/months/${m.id}`}>{cell}</Link>
            ) : (
              <div key={`${m.year}-${m.month}`}>{cell}</div>
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
                  {fy.balance >= 0 ? "+" : "−"}{formatCurrency(Math.abs(fy.balance))}
                </p>
                <p className="text-[10px] text-muted-foreground">{formatCurrency(fy.income)} in</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
