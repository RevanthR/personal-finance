"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  Cell, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { formatCurrency, MONTHS } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { compactAxisFmt } from "./compact-axis-fmt";
import type { MonthData } from "./year-overview-client";

export function YearChart({ months }: { months: MonthData[] }) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const axisFmt = (v: number) => compactAxisFmt(v, hidden);
  const lastActualIdx = months.reduce((last, m, i) => (m.isPopulated ? i : last), -1);

  const data = months.map((m, i) => ({
    name: MONTHS[m.month - 1],
    income: m.income,
    expenses: m.expenses,
    // Split balance into two series so we can style actual (solid) and projected (dashed) differently
    balanceActual: m.isPopulated ? m.balance : undefined,
    // Projected line starts at the last actual point to connect cleanly
    balanceProj: (!m.isPopulated || i === lastActualIdx) ? m.balance : undefined,
    isProjected: !m.isPopulated,
    isCurrent: m.isCurrent,
  }));

  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs font-semibold text-muted-foreground mb-3">Income vs Expenses</p>
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={data} barGap={1} barCategoryGap="22%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={36} tickFormatter={axisFmt} />
          <ReferenceLine y={0} stroke="#e4e4e7" strokeWidth={1} />
          <Tooltip
            formatter={(v: unknown, name: unknown) => [fmt(Number(v)), String(name)]}
            contentStyle={{ fontSize: 11, border: "1px solid #e4e4e7", borderRadius: 8, padding: "6px 10px" }}
            labelStyle={{ fontWeight: 600, marginBottom: 2 }}
          />
          <Bar dataKey="income" name="Income" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.isCurrent ? "#15803d" : d.isProjected ? "#bbf7d0" : "#16a34a"} />
            ))}
          </Bar>
          <Bar dataKey="expenses" name="Expenses" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.isCurrent ? "#b91c1c" : d.isProjected ? "#fecaca" : "#dc2626"} />
            ))}
          </Bar>
          <Line
            dataKey="balanceActual" name="Balance"
            stroke="#2563eb" strokeWidth={2}
            dot={{ r: 2.5, fill: "#2563eb", strokeWidth: 0 }}
            connectNulls={false}
          />
          <Line
            dataKey="balanceProj" name="Projected balance"
            stroke="#2563eb" strokeWidth={2} strokeDasharray="4 3"
            dot={{ r: 2, fill: "#93b8f5", strokeWidth: 0 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-2 justify-center flex-wrap">
        <Legend color="#16a34a" label="Actual income" />
        <Legend color="#bbf7d0" label="Projected income" />
        <Legend color="#dc2626" label="Actual expenses" />
        <LegendLine solid label="Balance" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-3 h-2.5 rounded-sm inline-block shrink-0" style={{ background: color }} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function LegendLine({ label, solid }: { label: string; solid?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <svg width="16" height="8" viewBox="0 0 16 8">
        <line x1="0" y1="4" x2="16" y2="4" stroke="#2563eb" strokeWidth="2"
          strokeDasharray={solid ? undefined : "4 3"} />
      </svg>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
