"use client";

import { useState } from "react";
import { formatCurrency, formatMonthYear, CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { EntryRow } from "./entry-row";
import { AdHocDialog } from "./adhoc-dialog";
import { SetupMonthDialog } from "./setup-month-dialog";
import { format } from "date-fns";

interface DashboardClientProps {
  currentMonth: MonthWithDetails | null;
  recentMonths: MonthWithDetails[];
  chitFunds: ChitFundWithTemplate[];
  todayMonth: number;
  todayYear: number;
  userId: string;
}

// Types inferred from Prisma shapes
type MonthWithDetails = {
  id: string;
  month: number;
  year: number;
  salaryIncome: number;
  freelanceIncome: number;
  otherIncome: number;
  isPopulated: boolean;
  entries: EntryWithTemplate[];
  adHocItems: AdHocItem[];
};

type EntryWithTemplate = {
  id: string;
  amount: number;
  isPaid: boolean;
  paidOn: string | null;
  notes: string | null;
  templateId: string;
  template: {
    id: string;
    name: string;
    category: string;
    isFixed: boolean;
    dueDateDay: number | null;
    chitFund: { isLifted: boolean; accumulatedSavings: number } | null;
  };
};

type AdHocItem = {
  id: string;
  name: string;
  amount: number;
  type: string;
  category: string | null;
  date: string;
  notes: string | null;
};

type ChitFundWithTemplate = {
  id: string;
  totalValue: number;
  isLifted: boolean;
  accumulatedSavings: number;
  monthlyUnliftedAmount: number;
  liftedUsedFor: string | null;
  template: { name: string };
};

export function DashboardClient({
  currentMonth: initialMonth,
  recentMonths,
  chitFunds,
  todayMonth,
  todayYear,
}: DashboardClientProps) {
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [showSetup, setShowSetup] = useState(!initialMonth);

  const totalIncome = currentMonth
    ? currentMonth.salaryIncome + currentMonth.freelanceIncome + currentMonth.otherIncome
    : 0;

  const adHocIncome = currentMonth?.adHocItems
    .filter((i) => i.type === "INCOME")
    .reduce((s, i) => s + i.amount, 0) ?? 0;

  const adHocExpense = currentMonth?.adHocItems
    .filter((i) => i.type === "EXPENSE")
    .reduce((s, i) => s + i.amount, 0) ?? 0;

  const grandIncome = totalIncome + adHocIncome;

  const totalCommitted = currentMonth?.entries.reduce((s, e) => s + e.amount, 0) ?? 0;
  const totalPaid = currentMonth?.entries
    .filter((e) => e.isPaid)
    .reduce((s, e) => s + e.amount, 0) ?? 0;
  const totalPending = totalCommitted - totalPaid;
  const balance = grandIncome - totalCommitted - adHocExpense;
  const paidPercent = totalCommitted > 0 ? Math.round((totalPaid / totalCommitted) * 100) : 0;

  // Pending payments sorted by due date
  const pendingEntries = (currentMonth?.entries ?? [])
    .filter((e) => !e.isPaid)
    .sort((a, b) => (a.template.dueDateDay ?? 99) - (b.template.dueDateDay ?? 99));

  // Category breakdown for pie chart
  const categoryBreakdown = Object.entries(
    (currentMonth?.entries ?? []).reduce<Record<string, number>>((acc, e) => {
      const cat = e.template.category;
      acc[cat] = (acc[cat] || 0) + e.amount;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name: CATEGORY_LABELS[name] ?? name, value, key: name }));

  // Trend data for bar chart
  const trendData = [...recentMonths]
    .reverse()
    .map((m) => {
      const income = m.salaryIncome + m.freelanceIncome + m.otherIncome;
      const committed = m.entries.reduce((s: number, e: { amount: number }) => s + e.amount, 0);
      const adhocExp = m.adHocItems
        .filter((i: { type: string }) => i.type === "EXPENSE")
        .reduce((s: number, i: { amount: number }) => s + i.amount, 0);
      return {
        name: format(new Date(m.year, m.month - 1), "MMM"),
        Income: income,
        Committed: committed + adhocExp,
      };
    });

  async function handleEntryUpdate(entryId: string, updates: { isPaid?: boolean; amount?: number; notes?: string }) {
    if (!currentMonth) return;
    const res = await fetch(`/api/months/${currentMonth.id}/entries`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId, ...updates }),
    });
    if (!res.ok) { toast.error("Failed to update"); return; }
    const updated = await res.json();
    setCurrentMonth((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: prev.entries.map((e) => (e.id === entryId ? { ...e, ...updated } : e)),
      };
    });
    if (updates.isPaid !== undefined) {
      toast.success(updates.isPaid ? "Marked as paid" : "Marked as pending");
    }
  }

  async function handleAdHocAdd(item: { name: string; amount: number; type: string; category?: string; date: string; notes?: string }) {
    if (!currentMonth) return;
    const res = await fetch(`/api/months/${currentMonth.id}/adhoc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!res.ok) { toast.error("Failed to add"); return; }
    const newItem = await res.json();
    setCurrentMonth((prev) => prev ? { ...prev, adHocItems: [...prev.adHocItems, newItem] } : prev);
    toast.success("Added successfully");
    setShowAdHoc(false);
  }

  async function handleAdHocDelete(id: string) {
    if (!currentMonth) return;
    await fetch(`/api/months/${currentMonth.id}/adhoc?id=${id}`, { method: "DELETE" });
    setCurrentMonth((prev) => prev ? { ...prev, adHocItems: prev.adHocItems.filter((i) => i.id !== id) } : prev);
    toast.success("Removed");
  }

  async function handleSetupMonth(salaryIncome: number) {
    const res = await fetch("/api/months", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: todayMonth, year: todayYear, salaryIncome }),
    });
    if (!res.ok) { toast.error("Failed to set up month"); return; }
    // Reload
    const mRes = await fetch(`/api/months?month=${todayMonth}&year=${todayYear}`);
    window.location.reload();
  }

  if (!currentMonth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">{formatMonthYear(todayMonth, todayYear)}</h2>
          <p className="text-muted-foreground mb-6">Set up this month to start tracking</p>
          <Button onClick={() => setShowSetup(true)} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" />
            Set Up {formatMonthYear(todayMonth, todayYear)}
          </Button>
        </div>
        <SetupMonthDialog
          open={showSetup}
          onOpenChange={setShowSetup}
          month={todayMonth}
          year={todayYear}
          onConfirm={handleSetupMonth}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{formatMonthYear(currentMonth.month, currentMonth.year)}</h1>
          <p className="text-sm text-muted-foreground">{paidPercent}% of commitments paid</p>
        </div>
        <Button
          onClick={() => setShowAdHoc(true)}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-1" /> Ad-hoc
        </Button>
      </div>

      {/* Top metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          label="Net Income"
          value={formatCurrency(grandIncome)}
          icon={<Wallet className="w-4 h-4" />}
          color="text-emerald-600"
          sub={currentMonth.freelanceIncome > 0 ? `+${formatCurrency(currentMonth.freelanceIncome)} freelance` : undefined}
        />
        <MetricCard
          label="Committed"
          value={formatCurrency(totalCommitted)}
          icon={<TrendingDown className="w-4 h-4" />}
          color="text-rose-500"
          sub={`${pendingEntries.length} pending`}
        />
        <MetricCard
          label="Paid"
          value={formatCurrency(totalPaid)}
          icon={<CheckCircle2 className="w-4 h-4" />}
          color="text-indigo-600"
          sub={`${currentMonth.entries.filter((e) => e.isPaid).length}/${currentMonth.entries.length} items`}
        />
        <MetricCard
          label="Balance"
          value={formatCurrency(balance)}
          icon={balance >= 0 ? <TrendingUp className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          color={balance >= 0 ? "text-emerald-600" : "text-rose-500"}
          sub={balance < 0 ? "Deficit" : "Surplus"}
        />
      </div>

      {/* Payment progress */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Payment Progress</span>
            <span className="font-semibold">{paidPercent}%</span>
          </div>
          <Progress value={paidPercent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>Paid: {formatCurrency(totalPaid)}</span>
            <span>Pending: {formatCurrency(totalPending)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left: Entries */}
        <div className="lg:col-span-2 space-y-4">
          <Tabs defaultValue="pending">
            <TabsList className="w-full">
              <TabsTrigger value="pending" className="flex-1">
                Pending ({pendingEntries.length})
              </TabsTrigger>
              <TabsTrigger value="all" className="flex-1">
                All ({currentMonth.entries.length})
              </TabsTrigger>
              <TabsTrigger value="adhoc" className="flex-1">
                Ad-hoc ({currentMonth.adHocItems.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-2 mt-3">
              {pendingEntries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
                  All payments done!
                </div>
              ) : (
                pendingEntries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} onUpdate={handleEntryUpdate} />
                ))
              )}
            </TabsContent>

            <TabsContent value="all" className="space-y-2 mt-3">
              {Object.entries(
                currentMonth.entries.reduce<Record<string, EntryWithTemplate[]>>((acc, e) => {
                  const cat = e.template.category;
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(e);
                  return acc;
                }, {})
              ).map(([category, entries]) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">
                    {CATEGORY_LABELS[category] ?? category}
                  </p>
                  {entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} onUpdate={handleEntryUpdate} />
                  ))}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="adhoc" className="mt-3">
              <div className="space-y-2">
                {currentMonth.adHocItems.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">No ad-hoc items</p>
                ) : (
                  currentMonth.adHocItems.map((item) => (
                    <AdHocRow key={item.id} item={item} onDelete={handleAdHocDelete} />
                  ))
                )}
              </div>
              <Button
                variant="outline"
                className="w-full mt-3"
                onClick={() => setShowAdHoc(true)}
              >
                <Plus className="w-4 h-4 mr-1" /> Add Ad-hoc Item
              </Button>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: Charts & Chits */}
        <div className="space-y-4">
          {/* Category pie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Spend by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {categoryBreakdown.map((entry) => (
                      <Cell key={entry.key} fill={CATEGORY_COLORS[entry.key] ?? "#6b7280"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1">
                {categoryBreakdown.map((item) => (
                  <div key={item.key} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: CATEGORY_COLORS[item.key] ?? "#6b7280" }}
                      />
                      <span className="text-muted-foreground truncate">{item.name}</span>
                    </div>
                    <span className="font-medium">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 6-month trend */}
          {trendData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">6-Month Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={trendData} barSize={10}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis hide />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Income" fill="#10b981" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Committed" fill="#f43f5e" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Active chit funds */}
          {chitFunds.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Chit Funds</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {chitFunds.map((chit) => (
                  <div key={chit.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{chit.template.name}</span>
                      <Badge variant={chit.isLifted ? "destructive" : "secondary"} className="text-xs">
                        {chit.isLifted ? "Lifted" : "Active"}
                      </Badge>
                    </div>
                    {!chit.isLifted && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Savings accumulated</span>
                        <span className="font-medium text-emerald-600">
                          {formatCurrency(chit.accumulatedSavings)}
                        </span>
                      </div>
                    )}
                    {chit.isLifted && chit.liftedUsedFor && (
                      <p className="text-xs text-muted-foreground">Used for: {chit.liftedUsedFor}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AdHocDialog open={showAdHoc} onOpenChange={setShowAdHoc} onAdd={handleAdHocAdd} />
    </div>
  );
}

function MetricCard({
  label, value, icon, color, sub,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <span className={color}>{icon}</span>
        </div>
        <p className="text-lg md:text-xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function AdHocRow({ item, onDelete }: { item: AdHocItem; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-3">
        <span
          className={`w-2 h-2 rounded-full ${item.type === "INCOME" ? "bg-emerald-500" : "bg-rose-500"}`}
        />
        <div>
          <p className="text-sm font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(item.date), "dd MMM")}
            {item.notes ? ` · ${item.notes}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`text-sm font-semibold ${item.type === "INCOME" ? "text-emerald-600" : "text-rose-500"}`}
        >
          {item.type === "INCOME" ? "+" : "-"}{formatCurrency(item.amount)}
        </span>
        <button
          onClick={() => onDelete(item.id)}
          className="text-muted-foreground hover:text-rose-500 text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
