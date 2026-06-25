"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { formatCurrency, formatMonthYear, getCategoryDisplay, getCategoryColor } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Wallet, TrendingDown, CheckCircle2, AlertCircle, TrendingUp, Plus, Pencil, ChevronDown, Trash2, CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { EntryRow } from "./entry-row";
import { AdHocDialog, type CCCard } from "./adhoc-dialog";
import { SetupMonthDialog } from "./setup-month-dialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const DashboardCharts = dynamic(
  () => import("./dashboard-charts").then(m => m.DashboardCharts),
  { ssr: false, loading: () => <div className="h-64 rounded-xl bg-muted animate-pulse" /> }
);

interface DashboardClientProps {
  currentMonth: MonthWithDetails | null;
  recentMonths: MonthWithDetails[];
  chitFunds: ChitFundWithTemplate[];
  ccTemplates: { id: string; name: string; statementDay: number | null; dueDateDay: number | null }[];
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
  statementAmount: number | null;
  template: { id: string; name: string; category: string; customCategory: string | null; isFixed: boolean; dueDateDay: number | null; statementDay: number | null; chitFund: { isLifted: boolean; accumulatedSavings: number } | null };
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
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const CC_SUBCATEGORIES = ["Food", "Coffee", "Groceries", "Fuel", "Shopping", "Travel", "Health", "Bills", "Entertainment", "Other"];

function parseCCSubcat(notes: string | null): string {
  if (!notes) return "Other";
  for (const part of notes.split(" · ")) {
    if (CC_SUBCATEGORIES.includes(part)) return part;
  }
  return "Other";
}

function parseCCCardName(notes: string | null): string | null {
  if (!notes) return null;
  return notes.split(" · ")[0] ?? null;
}

function CCSubcatBreakdown({ txItems, onDelete }: { txItems: AdHocItem[]; onDelete: (id: string) => void }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const sections: [string, AdHocItem[]][] = CC_SUBCATEGORIES.reduce<[string, AdHocItem[]][]>((acc, sub) => {
    const matches = txItems.filter(t => parseCCSubcat(t.notes) === sub);
    if (matches.length) acc.push([sub, matches]);
    return acc;
  }, []);

  return (
    <div className="space-y-0.5">
      {sections.map(([subcat, txs]) => {
        const subtotal = txs.reduce((s, t) => s + t.amount, 0);
        const open = !!openSections[subcat];
        return (
          <div key={subcat}>
            <button
              type="button"
              onClick={() => setOpenSections(prev => ({ ...prev, [subcat]: !prev[subcat] }))}
              className="w-full flex items-center justify-between py-1.5 hover:bg-muted/50 rounded px-1 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", open && "rotate-180")} />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{subcat}</span>
                <span className="text-[10px] text-muted-foreground/60">({txs.length})</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-medium">{formatCurrency(subtotal)}</span>
            </button>
            {open && (
              <div className="space-y-1 mt-1 mb-1">
                {txs.map(t => <TransactionRow key={t.id} item={t} onDelete={onDelete} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CCCardBlock({
  entry, txItems, nextMonthName, onUpdate, onDelete,
}: {
  entry: EntryWithTemplate;
  txItems: AdHocItem[];
  nextMonthName: string;
  onUpdate: (id: string, updates: { isPaid?: boolean; amount?: number; notes?: string }) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const statementDay = entry.template.statementDay;
  const nextBillTotal = entry.statementAmount ?? 0;

  // Pre-close txs bumped entry.amount; post-close go to next bill
  const preCloseTxs = statementDay
    ? txItems.filter(t => new Date(t.date).getDate() <= statementDay)
    : [];
  const postCloseTxs = statementDay
    ? txItems.filter(t => new Date(t.date).getDate() > statementDay)
    : txItems;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-2">
          <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">{entry.template.name}</span>
        </div>
        {statementDay && (
          <span className="text-[10px] text-muted-foreground">
            closes {statementDay}th
            {entry.template.dueDateDay ? (() => {
              const isNextMonth = entry.template.dueDateDay < statementDay;
              return ` · due ${entry.template.dueDateDay}th${isNextMonth ? ` ${nextMonthName}` : ""}`;
            })() : ""}
          </span>
        )}
      </div>

      {/* Current bill */}
      <div className="p-2">
        <EntryRow entry={entry} onUpdate={onUpdate} />
        {preCloseTxs.length > 0 && (
          <div className="mt-1.5 ml-3 border-l-2 border-zinc-200 pl-3 space-y-1">
            <p className="text-[10px] text-muted-foreground font-medium">Added to this bill</p>
            {preCloseTxs.map(t => <TransactionRow key={t.id} item={t} onDelete={onDelete} />)}
          </div>
        )}
      </div>

      {/* Next cycle charges */}
      {nextBillTotal > 0 && (
        <div className="border-t border-blue-100 bg-blue-50/60 px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">
              → {nextMonthName} bill
            </span>
            <span className="text-xs font-semibold text-blue-700">{formatCurrency(nextBillTotal)}</span>
          </div>
          {postCloseTxs.length > 0 && <CCSubcatBreakdown txItems={postCloseTxs} onDelete={onDelete} />}
        </div>
      )}
    </div>
  );
}

export function DashboardClient({ currentMonth: initialMonth, recentMonths, chitFunds, ccTemplates, todayMonth, todayYear }: DashboardClientProps) {
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [showSetup, setShowSetup] = useState(!initialMonth);
  const [showIncomeEdit, setShowIncomeEdit] = useState(false);
  const [salaryVal, setSalaryVal] = useState("");
  const [freelanceVal, setFreelanceVal] = useState("");
  const [otherVal, setOtherVal] = useState("");
  const [incomeLoading, setIncomeLoading] = useState(false);

  const entries = currentMonth?.entries ?? [];
  const adHocItems = currentMonth?.adHocItems ?? [];

  const adHocIncome      = useMemo(() => adHocItems.filter(i => i.type === "INCOME").reduce((s, i) => s + i.amount, 0), [adHocItems]);
  // Post-close CC charges live in statementAmount (next month's bill); pre-close go into entry.amount (Recurring)
  const ccStatementTotal = useMemo(() => entries.filter(e => e.template.category === "CREDIT_CARD").reduce((s, e) => s + (e.statementAmount ?? 0), 0), [entries]);
  const adHocExpense     = useMemo(() => adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").reduce((s, i) => s + i.amount, 0), [adHocItems]);
  const totalIncome    = currentMonth ? currentMonth.salaryIncome + currentMonth.freelanceIncome + currentMonth.otherIncome : 0;
  const grandIncome    = totalIncome + adHocIncome;
  const totalCommitted = useMemo(() => entries.reduce((s, e) => s + e.amount, 0), [entries]);
  const totalPaid      = useMemo(() => entries.filter(e => e.isPaid).reduce((s, e) => s + e.amount, 0), [entries]);
  const totalPending   = totalCommitted - totalPaid;
  // CC purchases this month pay next month — excluded from current balance
  const balance        = grandIncome - totalCommitted - adHocExpense;
  const paidPercent    = totalCommitted > 0 ? Math.round((totalPaid / totalCommitted) * 100) : 0;
  const pendingCount   = useMemo(() => entries.filter(e => !e.isPaid).length, [entries]);
  const nextMonthName  = MONTHS[todayMonth % 12]; // todayMonth is 1-12; % 12 maps Dec→Jan correctly

  type GroupedItem =
    | { kind: "entry"; data: EntryWithTemplate }
    | { kind: "transaction"; data: AdHocItem };

  const { grouped, oneTimeItems } = useMemo(() => {
    const result: Record<string, GroupedItem[]> = {};

    // Template entries grouped by category
    for (const cat of CATEGORY_ORDER) {
      const items = entries.filter(e => e.template.category === cat && !e.template.customCategory);
      if (items.length) result[cat] = items.map(d => ({ kind: "entry" as const, data: d }));
    }
    for (const e of entries) {
      if (e.template.customCategory) {
        const key = e.template.customCategory;
        if (!result[key]) result[key] = [];
        result[key].push({ kind: "entry", data: e });
      }
    }

    // Merge categorised ad-hoc EXPENSE items into their group
    const oneTime: AdHocItem[] = [];
    for (const item of adHocItems) {
      if (item.type === "EXPENSE" && item.category) {
        const key = item.category;
        if (result[key]) {
          result[key].push({ kind: "transaction", data: item });
        } else {
          // Category exists as a key but no template entries — create the group
          result[key] = [{ kind: "transaction", data: item }];
        }
      } else {
        oneTime.push(item);
      }
    }

    return { grouped: result, oneTimeItems: oneTime };
  }, [entries, adHocItems]);

  const categoryBreakdown = useMemo(() => Object.entries(
    entries.reduce<Record<string, number>>((acc, e) => {
      const key = e.template.customCategory ?? e.template.category;
      acc[key] = (acc[key] || 0) + e.amount;
      return acc;
    }, {})
  ).map(([key, value]) => {
    const entry = entries.find(e => (e.template.customCategory ?? e.template.category) === key);
    return {
      key,
      name: getCategoryDisplay(entry?.template.category ?? key, entry?.template.customCategory),
      value,
      color: getCategoryColor(entry?.template.category ?? key, entry?.template.customCategory),
    };
  }), [entries]);

  const { fyIncome, fyExpenses, fyBalance, trendData } = useMemo(() => {
    const fyIncome   = recentMonths.reduce((s, m) => s + m.salaryIncome + m.freelanceIncome + m.otherIncome + m.adHocItems.filter(i => i.type === "INCOME").reduce((a, i) => a + i.amount, 0), 0);
    const fyExpenses = recentMonths.reduce((s, m) => s + m.entries.reduce((a, e) => a + e.amount, 0) + m.adHocItems.filter(i => i.type === "EXPENSE").reduce((a, i) => a + i.amount, 0), 0);
    const trendData  = [...recentMonths].reverse().map(m => ({
      name: format(new Date(m.year, m.month - 1), "MMM"),
      Income: m.salaryIncome + m.freelanceIncome + m.otherIncome,
      Expenses: m.entries.reduce((s, e) => s + e.amount, 0),
    }));
    return { fyIncome, fyExpenses, fyBalance: fyIncome - fyExpenses, trendData };
  }, [recentMonths]);

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

  async function handleAdHocAdd(item: { name: string; amount: number; type: string; category?: string; date: string; notes?: string; ccTemplateId?: string }) {
    if (!currentMonth) return;
    const res = await fetch(`/api/months/${currentMonth.id}/adhoc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!res.ok) { toast.error("Failed to add"); return; }
    const { item: newItem, updatedEntry } = await res.json();
    setCurrentMonth(prev => {
      if (!prev) return prev;
      const updatedEntries = updatedEntry
        ? prev.entries.map(e => e.id === updatedEntry.id ? { ...e, amount: updatedEntry.amount, statementAmount: updatedEntry.statementAmount } : e)
        : prev.entries;
      return { ...prev, adHocItems: [...prev.adHocItems, newItem], entries: updatedEntries };
    });
    toast.success("Added");
    setShowAdHoc(false);
  }

  async function handleAdHocDelete(id: string) {
    if (!currentMonth) return;
    const res = await fetch(`/api/months/${currentMonth.id}/adhoc?id=${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to remove"); return; }
    const { updatedEntry } = await res.json();
    setCurrentMonth(prev => {
      if (!prev) return prev;
      const updatedEntries = updatedEntry
        ? prev.entries.map(e => e.id === updatedEntry.id ? { ...e, amount: updatedEntry.amount, statementAmount: updatedEntry.statementAmount } : e)
        : prev.entries;
      return { ...prev, adHocItems: prev.adHocItems.filter(i => i.id !== id), entries: updatedEntries };
    });
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
          <Plus className="w-3.5 h-3.5" /> Add Transaction
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
        <MetricCard label="Recurring" value={formatCurrency(totalCommitted)} icon={<TrendingDown className="w-4 h-4" />} color="text-red-600" sub={`${pendingCount} pending`} />
        <MetricCard
          label="Unplanned"
          value={formatCurrency(adHocExpense)}
          icon={<CheckCircle2 className="w-4 h-4" />}
          color="text-amber-600"
          sub={adHocExpense > 0 ? `${adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").length} transaction${adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").length !== 1 ? "s" : ""}` : "no extra spends"}
        />
        <MetricCard
          label={balance >= 0 ? "Leftover" : "Deficit"}
          value={formatCurrency(Math.abs(balance))}
          icon={balance >= 0 ? <TrendingUp className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          color={balance >= 0 ? "text-green-600" : "text-red-600"}
          sub={balance >= 0 ? "after all spends" : "over income"}
        />
      </div>

      {/* CC carry-forward summary */}
      {ccStatementTotal > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            <span className="text-sm text-blue-800 font-medium">Total carrying to {nextMonthName}</span>
          </div>
          <span className="text-sm text-blue-900 font-bold">{formatCurrency(ccStatementTotal)}</span>
        </div>
      )}

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Settled {formatCurrency(totalPaid)}</span>
          <span className="font-semibold text-foreground">{paidPercent}%</span>
          <span>Pending {formatCurrency(totalPending)}</span>
        </div>
        <Progress value={paidPercent} className="h-1.5" />
      </div>

      {/* Two-column layout on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Entries */}
        <div className="lg:col-span-2 space-y-4">
          {Object.entries(grouped).map(([groupKey, items]) => {
            const firstEntry = items.find(i => i.kind === "entry");
            const sampleCat = firstEntry?.kind === "entry"
              ? { cat: firstEntry.data.template.category, custom: firstEntry.data.template.customCategory }
              : { cat: groupKey, custom: null };
            const catColor = getCategoryColor(sampleCat.cat, sampleCat.custom);
            const catLabel = getCategoryDisplay(sampleCat.cat, sampleCat.custom);
            const entryItems = items.filter(i => i.kind === "entry");
            const txItems = items.filter(i => i.kind === "transaction").map(i => i.data as AdHocItem);
            const catTotal = entryItems.reduce((s, i) => s + i.data.amount, 0);
            const catPaid  = entryItems.reduce((s, i) => s + (i.data.isPaid ? i.data.amount : 0), 0);

            const isCC = groupKey === "CREDIT_CARD";

            return (
              <div key={groupKey}>
                <div className="flex items-center justify-between mb-1.5 px-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: catColor }} />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {catLabel}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(catPaid)} / {formatCurrency(catTotal)}
                  </span>
                </div>
                <div className="space-y-2">
                  {entryItems.map(item => {
                    if (isCC) {
                      const cardName = item.data.template.name;
                      const cardTxs = txItems.filter(t => parseCCCardName(t.notes) === cardName);
                      return (
                        <CCCardBlock
                          key={item.data.id}
                          entry={item.data}
                          txItems={cardTxs}
                          nextMonthName={nextMonthName}
                          onUpdate={handleEntryUpdate}
                          onDelete={handleAdHocDelete}
                        />
                      );
                    }
                    return <EntryRow key={item.data.id} entry={item.data} onUpdate={handleEntryUpdate} />;
                  })}
                  {!isCC && txItems.map(item =>
                    <TransactionRow key={item.id} item={item} onDelete={handleAdHocDelete} />
                  )}
                </div>

                {/* Orphaned CC transactions (card template deleted but transactions remain) */}
                {isCC && (() => {
                  const entryNames = new Set(entryItems.map(i => i.data.template.name));
                  const orphaned = txItems.filter(t => !entryNames.has(parseCCCardName(t.notes) ?? ""));
                  return orphaned.length > 0 ? (
                    <div className="mt-2 rounded-xl border border-dashed border-border px-3 py-2">
                      <p className="text-[10px] text-muted-foreground mb-1.5">Unmatched transactions</p>
                      <CCSubcatBreakdown txItems={orphaned} onDelete={handleAdHocDelete} />
                    </div>
                  ) : null;
                })()}
              </div>
            );
          })}

          {oneTimeItems.length > 0 && (
            <div>
              <div className="px-0.5 mb-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">One-time</span>
              </div>
              <div className="space-y-1.5">
                {oneTimeItems.map(item => (
                  <TransactionRow key={item.id} item={item} onDelete={handleAdHocDelete} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Recharts loaded lazily so it doesn't block navigation */}
        <div className="space-y-4">
          <DashboardCharts
            categoryBreakdown={categoryBreakdown}
            trendData={trendData}
            chitFunds={chitFunds}
          />
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

      <AdHocDialog
        open={showAdHoc}
        onOpenChange={setShowAdHoc}
        onAdd={handleAdHocAdd}
        ccCards={ccTemplates.map(t => ({ templateId: t.id, name: t.name } satisfies CCCard))}
      />
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

function TransactionRow({ item, onDelete }: { item: AdHocItem; onDelete: (id: string) => void }) {
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
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
