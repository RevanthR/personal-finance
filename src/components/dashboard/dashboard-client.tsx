"use client";

import { useState } from "react";
import { formatCurrency, formatMonthYear, CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Wallet, TrendingDown, CheckCircle2, AlertCircle, TrendingUp, Plus, Pencil,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import { toast } from "sonner";
import { EntryRow } from "./entry-row";
import { AdHocDialog } from "./adhoc-dialog";
import { SetupMonthDialog } from "./setup-month-dialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DashboardClientProps {
  currentMonth: MonthWithDetails | null;
  recentMonths: MonthWithDetails[];
  chitFunds: ChitFundWithTemplate[];
  todayMonth: number;
  todayYear: number;
  userId: string;
}

type MonthWithDetails = {
  id: string; month: number; year: number;
  salaryIncome: number; freelanceIncome: number; otherIncome: number;
  isPopulated: boolean;
  entries: EntryWithTemplate[];
  adHocItems: AdHocItem[];
};

type EntryWithTemplate = {
  id: string; amount: number; isPaid: boolean; paidOn: string | null; notes: string | null; templateId: string;
  template: { id: string; name: string; category: string; isFixed: boolean; dueDateDay: number | null; chitFund: { isLifted: boolean; accumulatedSavings: number } | null };
};

type AdHocItem = {
  id: string; name: string; amount: number; type: string; category: string | null; date: string; notes: string | null;
};

type ChitFundWithTemplate = {
  id: string; totalValue: number; isLifted: boolean; accumulatedSavings: number;
  monthlyUnliftedAmount: number; liftedUsedFor: string | null;
  template: { name: string };
};

const CATEGORY_ORDER = ["HOUSE_MAINTENANCE", "LOAN", "CREDIT_CARD", "CHIT_FUND", "SAVINGS", "PERSONAL", "MISCELLANEOUS"];

export function DashboardClient({ currentMonth: initialMonth, recentMonths, chitFunds, todayMonth, todayYear }: DashboardClientProps) {
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [showSetup, setShowSetup] = useState(!initialMonth);
  const [showIncomeEdit, setShowIncomeEdit] = useState(false);
  const [salaryVal, setSalaryVal] = useState("");
  const [freelanceVal, setFreelanceVal] = useState("");
  const [otherVal, setOtherVal] = useState("");
  const [incomeLoading, setIncomeLoading] = useState(false);

  const adHocIncome = currentMonth?.adHocItems.filter(i => i.type === "INCOME").reduce((s, i) => s + i.amount, 0) ?? 0;
  const adHocExpense = currentMonth?.adHocItems.filter(i => i.type === "EXPENSE").reduce((s, i) => s + i.amount, 0) ?? 0;
  const totalIncome = currentMonth ? currentMonth.salaryIncome + currentMonth.freelanceIncome + currentMonth.otherIncome : 0;
  const grandIncome = totalIncome + adHocIncome;
  const totalCommitted = currentMonth?.entries.reduce((s, e) => s + e.amount, 0) ?? 0;
  const totalPaid = currentMonth?.entries.filter(e => e.isPaid).reduce((s, e) => s + e.amount, 0) ?? 0;
  const totalPending = totalCommitted - totalPaid;
  const balance = grandIncome - totalCommitted - adHocExpense;
  const paidPercent = totalCommitted > 0 ? Math.round((totalPaid / totalCommitted) * 100) : 0;
  const pendingCount = currentMonth?.entries.filter(e => !e.isPaid).length ?? 0;

  const grouped = CATEGORY_ORDER.reduce<Record<string, EntryWithTemplate[]>>((acc, cat) => {
    const items = (currentMonth?.entries ?? []).filter(e => e.template.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});

  const categoryBreakdown = Object.entries(
    (currentMonth?.entries ?? []).reduce<Record<string, number>>((acc, e) => {
      acc[e.template.category] = (acc[e.template.category] || 0) + e.amount;
      return acc;
    }, {})
  ).map(([key, value]) => ({ key, name: CATEGORY_LABELS[key] ?? key, value }));

  // FY yearly summary from recentMonths
  const fyIncome = recentMonths.reduce((s, m) => s + m.salaryIncome + m.freelanceIncome + m.otherIncome + m.adHocItems.filter(i => i.type === "INCOME").reduce((a, i) => a + i.amount, 0), 0);
  const fyExpenses = recentMonths.reduce((s, m) => s + m.entries.reduce((a, e) => a + e.amount, 0) + m.adHocItems.filter(i => i.type === "EXPENSE").reduce((a, i) => a + i.amount, 0), 0);
  const fyBalance = fyIncome - fyExpenses;

  const trendData = [...recentMonths].reverse().map(m => ({
    name: format(new Date(m.year, m.month - 1), "MMM"),
    Income: m.salaryIncome + m.freelanceIncome + m.otherIncome,
    Expenses: m.entries.reduce((s, e) => s + e.amount, 0),
  }));

  function openIncomeEdit() {
    if (!currentMonth) return;
    setSalaryVal(String(currentMonth.salaryIncome));
    setFreelanceVal(String(currentMonth.freelanceIncome || ""));
    setOtherVal(String(currentMonth.otherIncome || ""));
    setShowIncomeEdit(true);
  }

  async function handleSaveIncome() {
    if (!currentMonth) return;
    const salary = parseFloat(salaryVal) || 0;
    const freelance = parseFloat(freelanceVal) || 0;
    const other = parseFloat(otherVal) || 0;
    setIncomeLoading(true);
    const res = await fetch(`/api/months/${currentMonth.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salaryIncome: salary, freelanceIncome: freelance, otherIncome: other }),
    });
    setIncomeLoading(false);
    if (!res.ok) { toast.error("Failed to save income"); return; }
    setCurrentMonth(prev => prev ? { ...prev, salaryIncome: salary, freelanceIncome: freelance, otherIncome: other } : prev);
    setShowIncomeEdit(false);
    toast.success("Income updated");
  }

  async function handleEntryUpdate(entryId: string, updates: { isPaid?: boolean; amount?: number; notes?: string }) {
    if (!currentMonth) return;
    const res = await fetch(`/api/months/${currentMonth.id}/entries`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId, ...updates }),
    });
    if (!res.ok) { toast.error("Failed to save"); return; }
    const updated = await res.json();
    setCurrentMonth(prev => prev ? {
      ...prev, entries: prev.entries.map(e => e.id === entryId ? { ...e, ...updated } : e),
    } : prev);
    if (updates.isPaid !== undefined) toast.success(updates.isPaid ? "Marked paid ✓" : "Marked pending");
  }

  async function handleAdHocAdd(item: { name: string; amount: number; type: string; category?: string; date: string; notes?: string }) {
    if (!currentMonth) return;
    const res = await fetch(`/api/months/${currentMonth.id}/adhoc`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item),
    });
    if (!res.ok) { toast.error("Failed to add"); return; }
    const newItem = await res.json();
    setCurrentMonth(prev => prev ? { ...prev, adHocItems: [...prev.adHocItems, newItem] } : prev);
    toast.success("Added");
    setShowAdHoc(false);
  }

  async function handleAdHocDelete(id: string) {
    if (!currentMonth) return;
    await fetch(`/api/months/${currentMonth.id}/adhoc?id=${id}`, { method: "DELETE" });
    setCurrentMonth(prev => prev ? { ...prev, adHocItems: prev.adHocItems.filter(i => i.id !== id) } : prev);
    toast.success("Removed");
  }

  async function handleSetupMonth(salaryIncome: number) {
    const res = await fetch("/api/months", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: todayMonth, year: todayYear, salaryIncome }),
    });
    if (!res.ok) { toast.error("Failed to set up month"); return; }
    window.location.reload();
  }

  if (!currentMonth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-2xl font-bold">{formatMonthYear(todayMonth, todayYear)}</h2>
        <p className="text-muted-foreground">Set up this month to start tracking</p>
        <Button onClick={() => setShowSetup(true)}>
          <Plus className="w-4 h-4 mr-2" /> Set Up {formatMonthYear(todayMonth, todayYear)}
        </Button>
        <SetupMonthDialog open={showSetup} onOpenChange={setShowSetup} month={todayMonth} year={todayYear} onConfirm={handleSetupMonth} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{formatMonthYear(currentMonth.month, currentMonth.year)}</h1>
          <p className="text-sm text-muted-foreground">
            {pendingCount > 0 ? `${pendingCount} payments pending` : "All paid ✓"}
          </p>
        </div>
        <Button onClick={() => setShowAdHoc(true)} size="sm" variant="outline" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Ad-hoc
        </Button>
      </div>

      {/* FY Summary Strip */}
      {recentMonths.length > 1 && (
        <Card className="bg-slate-900 text-white border-slate-800">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">FY26-27 Year to Date ({recentMonths.length} months)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-slate-400">Income</p>
                <p className="text-sm font-bold text-green-400">{formatCurrency(fyIncome)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Expenses</p>
                <p className="text-sm font-bold text-red-400">{formatCurrency(fyExpenses)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">{fyBalance >= 0 ? "Leftover" : "Deficit"}</p>
                <p className={cn("text-sm font-bold", fyBalance >= 0 ? "text-green-400" : "text-red-400")}>
                  {fyBalance >= 0 ? "+" : "-"}{formatCurrency(Math.abs(fyBalance))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button onClick={openIncomeEdit} className="text-left">
          <Card className="hover:border-zinc-400 transition-colors cursor-pointer h-full">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Income</p>
                <div className="flex items-center gap-1">
                  <span className="text-green-600"><Wallet className="w-4 h-4" /></span>
                  <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
                </div>
              </div>
              <p className="text-base font-bold">{formatCurrency(grandIncome)}</p>
              {(currentMonth.freelanceIncome > 0 || adHocIncome > 0) && (
                <p className="text-[10px] text-green-600 mt-0.5">
                  +{formatCurrency(currentMonth.freelanceIncome + adHocIncome)} extra
                </p>
              )}
            </CardContent>
          </Card>
        </button>
        <MetricCard label="Committed" value={formatCurrency(totalCommitted)} icon={<TrendingDown className="w-4 h-4" />} color="text-red-600" sub={`${pendingCount} pending`} />
        <MetricCard label="Paid" value={formatCurrency(totalPaid)} icon={<CheckCircle2 className="w-4 h-4" />} color="text-zinc-500" sub={`${currentMonth.entries.filter(e => e.isPaid).length}/${currentMonth.entries.length} items`} />
        <MetricCard
          label={balance >= 0 ? "Leftover" : "Deficit"}
          value={formatCurrency(Math.abs(balance))}
          icon={balance >= 0 ? <TrendingUp className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          color={balance >= 0 ? "text-green-600" : "text-red-600"}
          sub={balance >= 0 ? "after all commitments" : "over income"}
        />
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Paid {formatCurrency(totalPaid)}</span>
          <span className="font-semibold text-foreground">{paidPercent}%</span>
          <span>Pending {formatCurrency(totalPending)}</span>
        </div>
        <Progress value={paidPercent} className="h-1.5" />
      </div>

      {/* Two-column layout on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Entries */}
        <div className="lg:col-span-2 space-y-4">
          {Object.entries(grouped).map(([category, entries]) => {
            const catTotal = entries.reduce((s, e) => s + e.amount, 0);
            const catPaid = entries.filter(e => e.isPaid).reduce((s, e) => s + e.amount, 0);
            return (
              <div key={category}>
                <div className="flex items-center justify-between mb-1.5 px-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[category] ?? "#6b7280" }} />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {CATEGORY_LABELS[category] ?? category}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(catPaid)} / {formatCurrency(catTotal)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {entries.map(entry => (
                    <EntryRow key={entry.id} entry={entry} onUpdate={handleEntryUpdate} />
                  ))}
                </div>
              </div>
            );
          })}

          {currentMonth.adHocItems.length > 0 && (
            <div>
              <div className="px-0.5 mb-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ad-hoc</span>
              </div>
              <div className="space-y-1.5">
                {currentMonth.adHocItems.map(item => (
                  <AdHocRow key={item.id} item={item} onDelete={handleAdHocDelete} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: charts always visible on desktop */}
        <div className="space-y-4">
          {categoryBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Spend by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie data={categoryBreakdown} cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2} dataKey="value">
                      {categoryBreakdown.map(e => <Cell key={e.key} fill={CATEGORY_COLORS[e.key] ?? "#6b7280"} />)}
                    </Pie>
                    <Tooltip formatter={v => formatCurrency(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-1">
                  {categoryBreakdown.map(item => (
                    <div key={item.key} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[item.key] ?? "#6b7280" }} />
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
      </div>

      {/* Income Edit Dialog */}
      <Dialog open={showIncomeEdit} onOpenChange={setShowIncomeEdit}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Edit Income — {formatMonthYear(currentMonth.month, currentMonth.year)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Salary (₹)</Label>
              <Input
                type="number"
                value={salaryVal}
                onChange={e => setSalaryVal(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Freelance / Bonus (₹)</Label>
              <Input
                type="number"
                value={freelanceVal}
                onChange={e => setFreelanceVal(e.target.value)}
                placeholder="0 (optional)"
              />
            </div>
            <div>
              <Label className="text-xs">Other Income (₹)</Label>
              <Input
                type="number"
                value={otherVal}
                onChange={e => setOtherVal(e.target.value)}
                placeholder="0 (optional)"
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowIncomeEdit(false)} disabled={incomeLoading}>
              Cancel
            </Button>
            <Button onClick={handleSaveIncome} disabled={incomeLoading}>
              {incomeLoading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdHocDialog open={showAdHoc} onOpenChange={setShowAdHoc} onAdd={handleAdHocAdd} />
    </div>
  );
}

function MetricCard({ label, value, icon, color, sub }: { label: string; value: string; icon: React.ReactNode; color: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <span className={color}>{icon}</span>
        </div>
        <p className="text-base font-bold leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function AdHocRow({ item, onDelete }: { item: AdHocItem; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-card">
      <div className={cn("w-0.5 h-7 rounded-full shrink-0", item.type === "INCOME" ? "bg-green-600" : "bg-red-600")} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{item.name}</p>
        <p className="text-xs text-muted-foreground">{format(new Date(item.date), "dd MMM")}{item.notes ? ` · ${item.notes}` : ""}</p>
      </div>
      <span className={cn("text-sm font-semibold shrink-0", item.type === "INCOME" ? "text-green-600" : "text-red-600")}>
        {item.type === "INCOME" ? "+" : "-"}{formatCurrency(item.amount)}
      </span>
      <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600">
        ×
      </Button>
    </div>
  );
}
