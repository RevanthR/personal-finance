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

export function TrendChart({ data }: { data: TrendItem[] }) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} barSize={10} barGap={2}>
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

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} barSize={10} barGap={1}>
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
