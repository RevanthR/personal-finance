"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Label,
} from "recharts";
import { formatCurrency, MONTHS } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { compactAxisFmt } from "./compact-axis-fmt";
import type { MonthData } from "./year-overview-client";

// Rotating palette for per-card bar segments — distinct from the app's
// semantic tokens on purpose, this is identity coding (which card),
// not a status color.
const CARD_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#c026d3", "#4338ca", "#0d9488"];

export function CCTrendChart({ months }: { months: MonthData[] }) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const axisFmt = (v: number) => compactAxisFmt(v, hidden);

  // Stable card order (first-seen across the year) so each card keeps the
  // same color/stack position in every month's bar.
  const cardOrder: { templateId: string; name: string }[] = [];
  for (const m of months) {
    for (const c of m.ccByCard) {
      if (!cardOrder.some(x => x.templateId === c.templateId)) {
        cardOrder.push({ templateId: c.templateId, name: c.name });
      }
    }
  }

  if (cardOrder.length === 0) return null;

  const average = months.reduce((s, m) => s + m.ccTotal, 0) / months.length;

  const data = months.map(m => {
    const row: Record<string, string | number | boolean> = { name: MONTHS[m.month - 1], isCurrent: m.isCurrent };
    for (const c of cardOrder) {
      row[c.templateId] = m.ccByCard.find(x => x.templateId === c.templateId)?.amount ?? 0;
    }
    return row;
  });

  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs font-semibold text-muted-foreground mb-3">Credit card bills by month</p>
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={36} tickFormatter={axisFmt} />
          <Tooltip
            formatter={(v: unknown, name: unknown) => [fmt(Number(v)), cardOrder.find(c => c.templateId === name)?.name ?? String(name)]}
            contentStyle={{ fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px" }}
            labelStyle={{ fontWeight: 600, marginBottom: 2 }}
          />
          {cardOrder.map((c, i) => (
            <Bar
              key={c.templateId}
              dataKey={c.templateId}
              name={c.templateId}
              stackId="cc"
              fill={CARD_COLORS[i % CARD_COLORS.length]}
              radius={i === cardOrder.length - 1 ? [2, 2, 0, 0] : undefined}
            />
          ))}
          {average > 0 && (
            <ReferenceLine y={average} stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 3">
              <Label value={`Avg ${fmt(average)}`} position="insideTopRight" fontSize={9} fill="#64748b" />
            </ReferenceLine>
          )}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-2 justify-center flex-wrap">
        {cardOrder.map((c, i) => (
          <div key={c.templateId} className="flex items-center gap-1">
            <span className="w-3 h-2.5 rounded-sm inline-block shrink-0" style={{ background: CARD_COLORS[i % CARD_COLORS.length] }} />
            <span className="text-xs text-muted-foreground">{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
