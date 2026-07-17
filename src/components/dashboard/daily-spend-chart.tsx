"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonthYear, getCategoryColor, getCategoryDisplay } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { compactAxisFmt } from "@/components/months/compact-axis-fmt";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";

type AdHocItem = {
  id: string; type: string; amount: number; date: string;
  category: string | null; customCategory: string | null; customCategoryId: string | null; subCategory: string | null; ccTemplateId: string | null;
};

type RecentMonthSummary = {
  id: string; month: number; year: number;
  adHocItems: AdHocItem[];
};

interface DailySpendChartProps {
  recentMonths: RecentMonthSummary[];
  targetMonth?: number;
  targetYear?: number;
  todayMonth: number;
  todayYear: number;
  fmt: (v: number) => string;
}

type Mode = "category" | "method";
type Series = { key: string; name: string; color: string };

const OTHER_KEY = "__other__";
const TOP_CATEGORIES = 5;
const METHOD_SERIES: Series[] = [
  { key: "Card", name: "Card", color: "var(--primary)" },
  { key: "Cash", name: "Cash / other", color: "var(--warning)" },
];

function buildCategorySeries(items: AdHocItem[]): Series[] {
  const totals = new Map<string, { amount: number; category: string; customCategory: string | null }>();
  for (const item of items) {
    const cat = item.category ?? "MISCELLANEOUS";
    const key = item.customCategory ?? cat;
    if (!totals.has(key)) totals.set(key, { amount: 0, category: cat, customCategory: item.customCategory });
    totals.get(key)!.amount += item.amount;
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1].amount - a[1].amount);
  const series: Series[] = sorted.slice(0, TOP_CATEGORIES).map(([key, v]) => ({
    key,
    name: getCategoryDisplay(v.category, v.customCategory),
    color: getCategoryColor(v.category, v.customCategory),
  }));
  if (sorted.length > TOP_CATEGORIES) series.push({ key: OTHER_KEY, name: "Other", color: "#9ca3af" });
  return series;
}

export function DailySpendChart({ recentMonths, targetMonth, targetYear, todayMonth, todayYear, fmt }: DailySpendChartProps) {
  const { hidden } = usePrivacy();
  const axisFmt = (v: number) => compactAxisFmt(v, hidden);
  const [mode, setMode] = useState<Mode>("category");
  const initial = recentMonths.find(m => m.month === targetMonth && m.year === targetYear) ?? recentMonths[0];
  const [selectedId, setSelectedId] = useState(initial?.id);
  const selected = recentMonths.find(m => m.id === selectedId) ?? initial;

  const { buckets, series, average } = useMemo(() => {
    if (!selected) return { buckets: [] as Record<string, number>[], series: [] as Series[], average: 0 };
    const daysInMonth = new Date(selected.year, selected.month, 0).getDate();
    const isCurrentMonth = selected.month === todayMonth && selected.year === todayYear;
    const lastDay = isCurrentMonth ? Math.min(new Date().getDate(), daysInMonth) : daysInMonth;

    const expenseItems = selected.adHocItems.filter(i => i.type === "EXPENSE");
    const series = mode === "category" ? buildCategorySeries(expenseItems) : METHOD_SERIES;
    const seriesKeys = new Set(series.map(s => s.key));

    const buckets = Array.from({ length: lastDay }, (_, i) => {
      const row: Record<string, number> = { day: i + 1 };
      for (const s of series) row[s.key] = 0;
      return row;
    });

    let total = 0;
    for (const item of expenseItems) {
      const d = new Date(item.date).getDate();
      if (d < 1 || d > lastDay) continue;
      total += item.amount;
      const key = mode === "category"
        ? (() => {
            const raw = item.customCategory ?? item.category ?? "MISCELLANEOUS";
            return seriesKeys.has(raw) ? raw : OTHER_KEY;
          })()
        : (item.ccTemplateId ? "Card" : "Cash");
      buckets[d - 1][key] = (buckets[d - 1][key] ?? 0) + item.amount;
    }

    return { buckets, series, average: lastDay > 0 ? total / lastDay : 0 };
  }, [selected, mode, todayMonth, todayYear]);

  // Sub-category totals combine card + cash spend under the same label
  // (e.g. "Coffee" bought once by card and once by cash sums to one line)
  // regardless of which breakdown mode the chart above is showing.
  const topSubcats = useMemo(() => {
    if (!selected) return [] as { name: string; amount: number }[];
    const totals = new Map<string, number>();
    for (const item of selected.adHocItems) {
      if (item.type !== "EXPENSE" || !item.subCategory) continue;
      totals.set(item.subCategory, (totals.get(item.subCategory) ?? 0) + item.amount);
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }));
  }, [selected]);

  if (!selected) return null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4 flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Daily Spend
          </CardTitle>
          {average > 0 && (
            <p className="text-base font-bold tabular-nums mt-1">
              {fmt(average)}<span className="text-xs font-normal text-muted-foreground"> avg/day</span>
            </p>
          )}
        </div>
        <select
          value={selected.id}
          onChange={e => setSelectedId(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {recentMonths.map(m => (
            <option key={m.id} value={m.id}>{formatMonthYear(m.month, m.year)}</option>
          ))}
        </select>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "category", label: "By category" },
            { value: "method", label: "Card vs cash" },
          ]}
          className="mb-2"
        />
        {buckets.length > 0 ? (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={buckets} barGap={1}>
              <XAxis
                dataKey="day"
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={36}
                tickFormatter={axisFmt}
              />
              <Tooltip
                labelFormatter={(day) => `Day ${day}`}
                formatter={(v) => fmt(Number(v))}
                contentStyle={{ fontSize: 11, borderRadius: 8, background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
              {average > 0 && (
                <ReferenceLine y={average} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
              )}
              {series.map(s => (
                <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color} opacity={0.9} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-muted-foreground py-8 text-center">No spend data for this month yet</p>
        )}
        {topSubcats.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Top sub-categories
            </p>
            <div className="space-y-1">
              {topSubcats.map(s => (
                <div key={s.name} className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{s.name}</span>
                  <span className="text-muted-foreground tabular-nums">{fmt(s.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
