"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

type TrendItem = {
  label: string;
  income: number;
  expenses: number;
  balance: number;
  savingsRate: number;
  salary: number;
  freelance: number;
  other: number;
  adHocIncome: number;
};

function dynBarSize(count: number) {
  if (count <= 3) return 48;
  if (count <= 6) return 32;
  if (count <= 9) return 20;
  return 14;
}

function dynHeight(count: number) {
  if (count <= 3) return 110;
  if (count <= 6) return 130;
  return 150;
}

export function TrendChart({ data }: { data: TrendItem[] }) {
  const bs = dynBarSize(data.length);
  return (
    <ResponsiveContainer width="100%" height={dynHeight(data.length)}>
      <BarChart data={data} barSize={bs} barGap={3} barCategoryGap="25%">
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip
          formatter={(v) => formatCurrency(Number(v))}
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <Bar dataKey="income" name="Income" fill="#86efac" radius={[2, 2, 0, 0]} opacity={0.85} />
        <Bar dataKey="expenses" name="Expenses" fill="#fca5a5" radius={[2, 2, 0, 0]} opacity={0.85} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function IncomeChart({ data }: { data: TrendItem[] }) {
  const hasFreelance = data.some(d => d.freelance > 0);
  const hasOther = data.some(d => d.other > 0);
  const hasAdHoc = data.some(d => d.adHocIncome > 0);
  const bs = dynBarSize(data.length);

  return (
    <ResponsiveContainer width="100%" height={dynHeight(data.length)}>
      <BarChart data={data} barSize={bs} barCategoryGap="25%">
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip
          formatter={(v) => formatCurrency(Number(v))}
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
        <Bar dataKey="salary" name="Salary" fill="#34d399" radius={[2, 2, 0, 0]} stackId="inc" />
        {hasFreelance && <Bar dataKey="freelance" name="Freelance" fill="#22d3ee" stackId="inc" />}
        {hasOther && <Bar dataKey="other" name="Other" fill="#a78bfa" stackId="inc" />}
        {hasAdHoc && <Bar dataKey="adHocIncome" name="One-off" fill="#fb923c" stackId="inc" />}
      </BarChart>
    </ResponsiveContainer>
  );
}
