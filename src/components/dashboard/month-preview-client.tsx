"use client";

import Link from "next/link";
import { formatCurrency, getCategoryDisplay, getCategoryColor } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CATEGORY_ORDER = ["HOUSE_MAINTENANCE","LOAN","CREDIT_CARD","CHIT_FUND","SAVINGS","PERSONAL","MISCELLANEOUS"];

export type ProjectedEntry = {
  name: string;
  amount: number;
  category: string;
  customCategory: string | null;
  isFixed: boolean;
  dueDateDay: number | null;
};

interface MonthPreviewClientProps {
  month: number;
  year: number;
  projIncome: number;
  projExpenses: ProjectedEntry[];
  prevUrl: string;
  nextUrl: string;
}

export function MonthPreviewClient({ month, year, projIncome, projExpenses, prevUrl, nextUrl }: MonthPreviewClientProps) {
  const totalExpenses = projExpenses.reduce((s, e) => s + e.amount, 0);
  const balance = projIncome - totalExpenses;

  // Group by category
  const grouped = new Map<string, ProjectedEntry[]>();
  for (const order of CATEGORY_ORDER) {
    const items = projExpenses.filter(e => !e.customCategory && e.category === order);
    if (items.length) grouped.set(order, items);
  }
  for (const e of projExpenses) {
    if (e.customCategory) {
      if (!grouped.has(e.customCategory)) grouped.set(e.customCategory, []);
      grouped.get(e.customCategory)!.push(e);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/months" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Year view
        </Link>
        <div className="flex items-center gap-2">
          <Link href={prevUrl} className="p-1.5 rounded-lg border hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="text-center min-w-[130px]">
            <p className="text-sm font-bold">{MONTH_NAMES[month - 1]} {year}</p>
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
              Projected
            </span>
          </div>
          <Link href={nextUrl} className="p-1.5 rounded-lg border hover:bg-muted transition-colors">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="w-20 shrink-0" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card style={{ background: "linear-gradient(135deg, white 0%, #f0fdf4 100%)" }}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Expected Income</p>
            <p className="text-base font-bold text-green-700">{formatCurrency(projIncome)}</p>
          </CardContent>
        </Card>
        <Card style={{ background: "linear-gradient(135deg, white 0%, #fef2f2 100%)" }}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Committed</p>
            <p className="text-base font-bold text-red-700">{formatCurrency(totalExpenses)}</p>
          </CardContent>
        </Card>
        <Card style={{ background: `linear-gradient(135deg, white 0%, ${balance >= 0 ? "#f0fdf4" : "#fef2f2"} 100%)` }}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">{balance >= 0 ? "Est. Leftover" : "Est. Deficit"}</p>
            <p className={cn("text-base font-bold", balance >= 0 ? "text-green-700" : "text-red-700")}>
              {balance >= 0 ? "+" : "−"}{formatCurrency(Math.abs(balance))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Projection note */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
        <p className="text-xs text-amber-800">
          Projection based on your active recurring templates. Actual amounts may differ once the month is set up.
        </p>
      </div>

      {/* Projected entries by category */}
      <div className="space-y-4">
        {[...grouped.entries()].map(([groupKey, items]) => {
          const sample = items[0];
          const catColor = getCategoryColor(sample.category, sample.customCategory);
          const catLabel = getCategoryDisplay(sample.category, sample.customCategory);
          const catTotal = items.reduce((s, e) => s + e.amount, 0);

          return (
            <div key={groupKey} className="relative pl-3">
              <div
                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full"
                style={{ backgroundColor: catColor, opacity: 0.5 }}
              />
              <div
                className="flex items-center justify-between mb-1.5 px-2 py-1.5 rounded-lg"
                style={{ background: `linear-gradient(to right, ${catColor}12, transparent)` }}
              >
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {catLabel}
                </span>
                <span className="text-xs text-muted-foreground">{formatCurrency(catTotal)}</span>
              </div>
              <div className="space-y-1.5">
                {items.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-xl border bg-card">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{entry.name}</p>
                      {entry.dueDateDay && (
                        <p className="text-[10px] text-muted-foreground/60">due {entry.dueDateDay}th</p>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-semibold text-muted-foreground">{formatCurrency(entry.amount)}</p>
                      {entry.isFixed && <p className="text-[10px] text-muted-foreground/60">fixed</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {grouped.size === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No active templates for this month.</p>
        )}
      </div>
    </div>
  );
}
