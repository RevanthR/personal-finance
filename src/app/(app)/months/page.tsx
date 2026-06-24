import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatMonthYear } from "@/lib/utils";
import { ChevronRight, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import type { MonthlyEntry, AdHocItem } from "@/generated/prisma/client";

export default async function MonthsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const months = await db.month.findMany({
    where: { userId: session.user.id },
    orderBy: [{ year: "asc" }, { month: "asc" }],
    include: { entries: true, adHocItems: true },
  });

  // Group by fiscal year (April–March)
  function getFY(month: number, year: number) {
    return month >= 4 ? `FY${String(year).slice(2)}-${String(year + 1).slice(2)}` : `FY${String(year - 1).slice(2)}-${String(year).slice(2)}`;
  }

  type MonthSummary = {
    id: string; month: number; year: number;
    income: number; committed: number; balance: number;
    paid: number; total: number;
  };

  const summaries: MonthSummary[] = months.map(m => {
    const income = m.salaryIncome + m.freelanceIncome + m.otherIncome
      + m.adHocItems.filter((i: AdHocItem) => i.type === "INCOME").reduce((s: number, i: AdHocItem) => s + i.amount, 0);
    const committed = m.entries.reduce((s: number, e: MonthlyEntry) => s + e.amount, 0)
      + m.adHocItems.filter((i: AdHocItem) => i.type === "EXPENSE").reduce((s: number, i: AdHocItem) => s + i.amount, 0);
    return {
      id: m.id, month: m.month, year: m.year,
      income, committed, balance: income - committed,
      paid: m.entries.filter((e: MonthlyEntry) => e.isPaid).length,
      total: m.entries.length,
    };
  });

  // Group by FY
  const byFY = summaries.reduce<Record<string, MonthSummary[]>>((acc, s) => {
    const fy = getFY(s.month, s.year);
    if (!acc[fy]) acc[fy] = [];
    acc[fy].push(s);
    return acc;
  }, {});

  const fyKeys = Object.keys(byFY).sort().reverse();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold">Monthly History</h1>

      {fyKeys.length === 0 && (
        <p className="text-muted-foreground">No months recorded yet.</p>
      )}

      {fyKeys.map(fy => {
        const fyMonths = byFY[fy];
        const fyIncome = fyMonths.reduce((s, m) => s + m.income, 0);
        const fyExpenses = fyMonths.reduce((s, m) => s + m.committed, 0);
        const fyBalance = fyIncome - fyExpenses;

        return (
          <div key={fy} className="space-y-3">
            {/* FY summary header */}
            <div className="flex items-start justify-between">
              <h2 className="text-base font-semibold text-muted-foreground">{fy}</h2>
              <span className="text-xs text-muted-foreground">{fyMonths.length} months</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <SummaryCard label="Total Income" value={fyIncome} icon={<Wallet className="w-3.5 h-3.5" />} color="text-green-600" />
              <SummaryCard label="Total Expenses" value={fyExpenses} icon={<TrendingDown className="w-3.5 h-3.5" />} color="text-red-600" />
              <SummaryCard
                label={fyBalance >= 0 ? "Leftover" : "Deficit"}
                value={Math.abs(fyBalance)}
                icon={fyBalance >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                color={fyBalance >= 0 ? "text-green-600" : "text-red-600"}
                sub={fyBalance >= 0 ? "after all spends" : "over income"}
              />
            </div>

            {/* Month rows */}
            <div className="space-y-1.5">
              {[...fyMonths].reverse().map(m => (
                <Link key={m.id} href={`/months/${m.id}`}>
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl border bg-card hover:border-zinc-400 transition-colors cursor-pointer">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{formatMonthYear(m.month, m.year)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {m.paid}/{m.total} paid · {formatCurrency(m.income)} income
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className={`text-xs font-medium ${m.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {m.balance >= 0 ? "Leftover" : "Deficit"}
                        </p>
                        <p className={`text-sm font-bold ${m.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(Math.abs(m.balance))}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SummaryCard({ label, value, icon, color, sub }: { label: string; value: number; icon: React.ReactNode; color: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
          <span className={color}>{icon}</span>
        </div>
        <p className="text-sm font-bold leading-tight">{formatCurrency(value)}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
