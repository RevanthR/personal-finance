"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
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
}

export function DashboardCharts({ categoryBreakdown, trendData, chitFunds }: DashboardChartsProps) {
  return (
    <div className="space-y-4">
      {categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Spend by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie
                  data={categoryBreakdown}
                  cx="50%" cy="50%"
                  innerRadius={48} outerRadius={78}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {categoryBreakdown.map(e => <Cell key={e.key} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={v => formatCurrency(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 mt-1">
              {categoryBreakdown.map(item => (
                <div key={item.key} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                    <span className="text-muted-foreground">{item.name}</span>
                  </div>
                  <span className="font-medium">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {trendData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monthly Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={trendData} barSize={10}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis hide />
                <Tooltip formatter={v => formatCurrency(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Income" fill="#15803d" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Expenses" fill="#b91c1c" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {chitFunds.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Chit Funds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {chitFunds.map(chit => (
              <div key={chit.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{chit.template.name}</p>
                  {chit.isLifted
                    ? <p className="text-xs text-muted-foreground">Lifted</p>
                    : <p className="text-xs text-green-600">Saved {formatCurrency(chit.accumulatedSavings)}</p>
                  }
                </div>
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ml-2",
                  chit.isLifted ? "bg-zinc-100 text-zinc-600" : "bg-green-50 text-green-700"
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
