"use client";

import { useState, useMemo, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { formatCurrency, formatMonthYear, getCategoryDisplay, getCategoryColor } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Wallet, TrendingDown, CheckCircle2, AlertCircle, TrendingUp, Plus, Pencil, ChevronDown, Trash2, CreditCard, ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { EntryRow } from "./entry-row";
import { DashboardTour } from "@/components/coach/dashboard-tour";
import type { CCCard } from "./adhoc-dialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const DashboardCharts = dynamic(
  () => import("./dashboard-charts").then(m => m.DashboardCharts),
  { ssr: false, loading: () => <div className="h-64 rounded-xl bg-muted animate-pulse" /> }
);

const AdHocDialog = dynamic(
  () => import("./adhoc-dialog").then(m => m.AdHocDialog),
  { ssr: false }
);

const SetupMonthDialog = dynamic(
  () => import("./setup-month-dialog").then(m => m.SetupMonthDialog),
  { ssr: false }
);

export type ProjectedEntry = {
  name: string;
  amount: number;
  category: string;
  customCategory: string | null;
  isFixed: boolean;
  dueDateDay: number | null;
};

interface DashboardClientProps {
  currentMonth: MonthWithDetails | null;
  recentMonths: RecentMonthSummary[];
  ccTemplates: { id: string; name: string; statementDay: number | null; dueDateDay: number | null }[];
  suggestedIncome: number;
  todayMonth: number;
  todayYear: number;
  userId: string;
  targetMonth?: number;
  targetYear?: number;
  prevUrl?: string;
  nextUrl?: string;
  projectedIncome?: number;
  projectedEntries?: ProjectedEntry[];
}

type MonthWithDetails = {
  id: string; month: number; year: number;
  salaryIncome: number; freelanceIncome: number; otherIncome: number;
  isPopulated: boolean;
  entries: EntryWithTemplate[];
  adHocItems: AdHocItem[];
};

type RecentMonthSummary = {
  id: string; month: number; year: number;
  salaryIncome: number; freelanceIncome: number; otherIncome: number;
  entries: { id: string; templateId: string; amount: number; cashbackAmount: number | null }[];
  adHocItems: { id: string; type: string; amount: number; category: string | null }[];
};

type EntryWithTemplate = {
  id: string; amount: number; isPaid: boolean; paidOn: string | null; paidAmount: number | null; cashbackAmount: number | null; notes: string | null; templateId: string;
  statementAmount: number | null;
  template: { id: string; name: string; category: string; customCategory: string | null; isFixed: boolean; dueDateDay: number | null; statementDay: number | null; chitFund: { isLifted: boolean; accumulatedSavings: number } | null; loanInterestRate: number | null; loanRateType: string | null; loanOriginalPrincipal: number | null; loanStartDate: string | null; loanOutstandingOverride: number | null };
};

type AdHocItem = {
  id: string; name: string; amount: number; type: string; category: string | null; date: string; notes: string | null;
};


const CATEGORY_ORDER = ["HOUSE_MAINTENANCE", "LOAN", "CREDIT_CARD", "CHIT_FUND", "SAVINGS", "PERSONAL", "MISCELLANEOUS"];

const INCOME_SOURCES = [
  { value: "bonus",     label: "Bonus",     dbCategory: "OTHER_INCOME" },
  { value: "freelance", label: "Freelance", dbCategory: "FREELANCE" },
  { value: "refund",    label: "Refund",    dbCategory: "OTHER_INCOME" },
  { value: "other",     label: "Other",     dbCategory: "OTHER_INCOME" },
];
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
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
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
              <span className="text-[10px] text-muted-foreground font-medium">{fmt(subtotal)}</span>
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
  entry, txItems, nextMonthName, isBillPending, onUpdate, onDelete, onClearStatement,
}: {
  entry: EntryWithTemplate;
  txItems: AdHocItem[];
  nextMonthName: string;
  isBillPending: boolean;
  onUpdate: (id: string, updates: { isPaid?: boolean; amount?: number; notes?: string; paidAmount?: number; cashbackAmount?: number }) => Promise<void>;
  onDelete: (id: string) => void;
  onClearStatement: (entryId: string) => Promise<void>;
}) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
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
        <EntryRow entry={entry} onUpdate={onUpdate} isBillPending={isBillPending} />
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
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-blue-700">{fmt(nextBillTotal)}</span>
              {/* Show clear button when balance is stale (no transactions but amount > 0) */}
              {postCloseTxs.length === 0 && (
                <button
                  onClick={() => onClearStatement(entry.id)}
                  className="text-[10px] text-blue-400 hover:text-blue-700 underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          {postCloseTxs.length > 0 && <CCSubcatBreakdown txItems={postCloseTxs} onDelete={onDelete} />}
        </div>
      )}
    </div>
  );
}

export function DashboardClient({ currentMonth: initialMonth, recentMonths: initialRecentMonths, ccTemplates, suggestedIncome, todayMonth, todayYear, targetMonth, targetYear, prevUrl, nextUrl, projectedIncome, projectedEntries }: DashboardClientProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const viewMonth = targetMonth ?? todayMonth;
  const viewYear  = targetYear  ?? todayYear;
  const isProjected = projectedEntries != null;
  const projEntries = projectedEntries ?? [];
  const isCurrentMonth = viewMonth === todayMonth && viewYear === todayYear;
  const todayDay = new Date().getDate();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(url: string) {
    startTransition(() => router.push(url));
  }
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [recentMonths, setRecentMonths] = useState(initialRecentMonths);
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [showSetup, setShowSetup] = useState(!initialMonth && !isProjected);
  const [showIncomeEdit, setShowIncomeEdit] = useState(false);
  const [salaryVal, setSalaryVal] = useState("");
  const [freelanceVal, setFreelanceVal] = useState("");
  const [otherVal, setOtherVal] = useState("");
  const [incomeLoading, setIncomeLoading] = useState(false);

  // Add one-time income (inline inside income dialog)
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [addIncomeSource, setAddIncomeSource] = useState("bonus");
  const [addIncomeAmount, setAddIncomeAmount] = useState("");
  const [addIncomeDate, setAddIncomeDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [addIncomeNotes, setAddIncomeNotes] = useState("");
  const [addIncomeLoading, setAddIncomeLoading] = useState(false);

  // Sync local state when the viewed month changes (client-side navigation reuses this component)
  const [lastMonthKey, setLastMonthKey] = useState(`${viewMonth}-${viewYear}`);
  const monthKey = `${viewMonth}-${viewYear}`;
  if (monthKey !== lastMonthKey) {
    setLastMonthKey(monthKey);
    setCurrentMonth(initialMonth);
    setRecentMonths(initialRecentMonths);
    setShowSetup(!initialMonth && !isProjected);
    setShowAdHoc(false);
    setShowIncomeEdit(false);
  }

  const entries = currentMonth?.entries ?? [];
  const adHocItems = currentMonth?.adHocItems ?? [];

  const adHocIncome      = useMemo(() => adHocItems.filter(i => i.type === "INCOME").reduce((s, i) => s + i.amount, 0), [adHocItems]);
  // Post-close CC charges live in statementAmount (next month's bill); pre-close go into entry.amount (Recurring)
  const ccStatementTotal = useMemo(() => entries.filter(e => e.template.category === "CREDIT_CARD").reduce((s, e) => s + (e.statementAmount ?? 0), 0), [entries]);
  const adHocExpense     = useMemo(() => adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").reduce((s, i) => s + i.amount, 0), [adHocItems]);
  const totalIncome    = currentMonth ? currentMonth.salaryIncome + currentMonth.freelanceIncome + currentMonth.otherIncome : 0;
  const grandIncome    = totalIncome + adHocIncome;
  const net = (e: EntryWithTemplate) => e.amount - (e.cashbackAmount ?? 0);
  // Actual money paid: paidAmount if set, else net(e) for fully paid, else 0
  const effectivePaid = (e: EntryWithTemplate): number => {
    if (e.isPaid) return e.paidAmount ?? net(e);
    return e.paidAmount ?? 0;
  };
  // CC entries where the statement hasn't closed yet don't count as liabilities
  const isBillPending = (e: EntryWithTemplate) =>
    isCurrentMonth &&
    e.template.category === "CREDIT_CARD" &&
    e.template.statementDay != null &&
    todayDay < e.template.statementDay;
  const totalCommitted = useMemo(() => entries.filter(e => !isBillPending(e)).reduce((s, e) => s + net(e), 0), [entries, isCurrentMonth, todayDay]);
  const totalPaid      = useMemo(() => entries.filter(e => !isBillPending(e)).reduce((s, e) => s + effectivePaid(e), 0), [entries, isCurrentMonth, todayDay]);
  const totalPending   = totalCommitted - totalPaid;
  // CC purchases this month pay next month — excluded from current balance
  const balance        = grandIncome - totalCommitted - adHocExpense;
  const paidPercent    = totalCommitted > 0 ? Math.round((totalPaid / totalCommitted) * 100) : 0;
  const pendingCount   = useMemo(() => entries.filter(e => !e.isPaid && !isBillPending(e)).length, [entries, isCurrentMonth, todayDay]);
  const nextMonthName  = MONTHS[todayMonth % 12]; // todayMonth is 1-12; % 12 maps Dec→Jan correctly

  type GroupedItem =
    | { kind: "entry"; data: EntryWithTemplate }
    | { kind: "transaction"; data: AdHocItem }
    | { kind: "projected"; data: ProjectedEntry };

  const { grouped, oneTimeItems } = useMemo(() => {
    if (isProjected) {
      const result: Record<string, GroupedItem[]> = {};
      for (const cat of CATEGORY_ORDER) {
        const items = projEntries.filter(e => !e.customCategory && e.category === cat);
        if (items.length) result[cat] = items.map(d => ({ kind: "projected" as const, data: d }));
      }
      for (const e of projEntries) {
        if (e.customCategory) {
          if (!result[e.customCategory]) result[e.customCategory] = [];
          result[e.customCategory].push({ kind: "projected" as const, data: e });
        }
      }
      return { grouped: result, oneTimeItems: [] };
    }

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
    // Income items are shown in the income panel, not here
    const oneTime: AdHocItem[] = [];
    for (const item of adHocItems) {
      if (item.type === "INCOME") continue;
      if (item.type === "EXPENSE" && item.category) {
        const key = item.category;
        if (result[key]) {
          result[key].push({ kind: "transaction", data: item });
        } else {
          result[key] = [{ kind: "transaction", data: item }];
        }
      } else {
        oneTime.push(item);
      }
    }

    return { grouped: result, oneTimeItems: oneTime };
  }, [entries, adHocItems, isProjected, projEntries]);

  // Enhanced breakdown includes ad-hoc expenses in their categories
  const categoryBreakdown = useMemo(() => {
    if (isProjected) {
      // Aggregate by category so multiple CC templates don't produce duplicate keys/names
      const totals = new Map<string, { amount: number; category: string; customCategory: string | null }>();
      for (const e of projEntries) {
        const key = e.customCategory ?? e.category;
        if (!totals.has(key)) totals.set(key, { amount: 0, category: e.category, customCategory: e.customCategory });
        totals.get(key)!.amount += e.amount;
      }
      return [...totals.entries()].map(([, { amount, category, customCategory }]) => ({
        key: customCategory ?? category,
        value: amount,
        name: getCategoryDisplay(category, customCategory),
        color: getCategoryColor(category, customCategory),
      })).sort((a, b) => b.value - a.value);
    }
    const totals: Record<string, { amount: number; templateCat: string; customCat: string | null }> = {};
    for (const e of entries) {
      if (isBillPending(e)) continue;
      const key = e.template.customCategory ?? e.template.category;
      if (!totals[key]) totals[key] = { amount: 0, templateCat: e.template.category, customCat: e.template.customCategory };
      totals[key].amount += net(e);
    }
    for (const item of adHocItems) {
      if (item.type === "EXPENSE" && item.category && item.category !== "CREDIT_CARD") {
        const key = item.category;
        if (!totals[key]) totals[key] = { amount: 0, templateCat: key, customCat: null };
        totals[key].amount += item.amount;
      }
    }
    return Object.entries(totals)
      .map(([key, { amount, templateCat, customCat }]) => ({
        key, value: amount,
        name: getCategoryDisplay(templateCat, customCat),
        color: getCategoryColor(templateCat, customCat),
      }))
      .sort((a, b) => b.value - a.value);
  }, [entries, adHocItems, isProjected, projEntries]);

  const { fyIncome, fyExpenses, fyBalance, trendData } = useMemo(() => {
    const fyIncome   = recentMonths.reduce((s, m) => s + m.salaryIncome + m.freelanceIncome + m.otherIncome + m.adHocItems.filter(i => i.type === "INCOME").reduce((a, i) => a + i.amount, 0), 0);
    const fyExpenses = recentMonths.reduce((s, m) => s + m.entries.reduce((a, e) => a + e.amount - (e.cashbackAmount ?? 0), 0) + m.adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").reduce((a, i) => a + i.amount, 0), 0);
    const trendData  = [...recentMonths].reverse().map(m => ({
      name: format(new Date(m.year, m.month - 1), "MMM"),
      Income: m.salaryIncome + m.freelanceIncome + m.otherIncome,
      Expenses: m.entries.reduce((s, e) => s + e.amount - (e.cashbackAmount ?? 0), 0),
    }));
    return { fyIncome, fyExpenses, fyBalance: fyIncome - fyExpenses, trendData };
  }, [recentMonths]);

  const ccSubcatBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const item of adHocItems) {
      if (item.category === "CREDIT_CARD") {
        const sub = parseCCSubcat(item.notes);
        totals[sub] = (totals[sub] || 0) + item.amount;
      }
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount }));
  }, [adHocItems]);

  const savingsRate = grandIncome > 0 ? Math.round((balance / grandIncome) * 100) : 0;

  const { prevMonthName, expensesDelta } = useMemo(() => {
    const prev = [...recentMonths]
      .filter(m => !(m.month === currentMonth?.month && m.year === currentMonth?.year))
      .sort((a, b) => b.year - a.year || b.month - a.month)[0];
    if (!prev) return { prevMonthName: null, expensesDelta: null };
    const prevExp = prev.entries.reduce((s, e) => s + e.amount - (e.cashbackAmount ?? 0), 0)
      + prev.adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").reduce((s, i) => s + i.amount, 0);
    return {
      prevMonthName: MONTHS[prev.month - 1],
      expensesDelta: (totalCommitted + adHocExpense) - prevExp,
    };
  }, [recentMonths, currentMonth, totalCommitted, adHocExpense]);

  const fixedAmount = useMemo(
    () => entries.filter(e => e.template.isFixed && !isBillPending(e)).reduce((s, e) => s + net(e), 0),
    [entries, isCurrentMonth, todayDay]
  );
  const variableAmount = totalCommitted - fixedAmount + adHocExpense;

  // Projected-mode display overrides — shadow the actual values when viewing a future month
  const dispIncome    = isProjected ? (projectedIncome ?? 0) : grandIncome;
  const dispCommitted = isProjected ? projEntries.reduce((s, e) => s + e.amount, 0) : totalCommitted;
  const dispAdHoc     = isProjected ? 0 : adHocExpense;
  const dispBalance   = dispIncome - dispCommitted - dispAdHoc;
  const dispPaidPct   = isProjected ? 0 : paidPercent;
  const dispPending   = isProjected ? dispCommitted : totalPending;
  const dispFixed     = isProjected ? projEntries.filter(e => e.isFixed).reduce((s, e) => s + e.amount, 0) : fixedAmount;
  const dispVariable  = isProjected ? (dispCommitted - dispFixed) : variableAmount;
  const dispSavings   = dispIncome > 0 ? Math.round(((dispIncome - dispCommitted - dispAdHoc) / dispIncome) * 100) : 0;

  const upcomingPayments = useMemo(() => {
    const isCurrentMonth = currentMonth?.month === todayMonth && currentMonth?.year === todayYear;
    if (!isCurrentMonth) return [];
    const today = new Date().getDate();
    return entries
      .filter(e => !e.isPaid && e.template.dueDateDay != null)
      .map(e => ({
        name: e.template.name,
        amount: net(e) - (e.paidAmount ?? 0),
        dueDay: e.template.dueDateDay!,
        overdue: e.template.dueDateDay! < today,
      }))
      .sort((a, b) => a.dueDay - b.dueDay)
      .slice(0, 6);
  }, [entries, currentMonth, todayMonth, todayYear]);

  // Collapsible groups: track user overrides; default = collapse if all entries paid
  const [groupToggled, setGroupToggled] = useState<Record<string, boolean>>({});
  function isGroupCollapsed(key: string, entryItems: { data: EntryWithTemplate }[]): boolean {
    if (key in groupToggled) return groupToggled[key];
    // projected: entryItems is empty → defaults to expanded (false); actual: collapses when all paid
    return entryItems.length > 0 && entryItems.every(i => i.data.isPaid);
  }
  function toggleGroup(key: string, entryItems: { data: EntryWithTemplate }[]) {
    setGroupToggled(prev => ({ ...prev, [key]: !isGroupCollapsed(key, entryItems) }));
  }

  function openIncomeEdit() {
    if (!currentMonth) return;
    setSalaryVal(String(currentMonth.salaryIncome));
    setFreelanceVal(String(currentMonth.freelanceIncome || ""));
    setOtherVal(String(currentMonth.otherIncome || ""));
    setShowAddIncome(false);
    setAddIncomeAmount("");
    setAddIncomeNotes("");
    setAddIncomeSource("bonus");
    setAddIncomeDate(new Date().toISOString().split("T")[0]);
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
    setRecentMonths(prev => prev.map(m => m.id === currentMonth!.id ? { ...m, salaryIncome: salary, freelanceIncome: freelance, otherIncome: other } : m));
    toast.success("Income updated");
  }

  async function handleAddOneTimeIncome() {
    const amt = parseFloat(addIncomeAmount);
    if (!amt || amt <= 0 || !currentMonth) return;
    setAddIncomeLoading(true);
    const source = INCOME_SOURCES.find(s => s.value === addIncomeSource);
    await handleAdHocAdd({
      name: source?.label ?? "Income",
      amount: amt,
      type: "INCOME",
      category: source?.dbCategory,
      date: addIncomeDate,
      notes: addIncomeNotes || undefined,
    });
    setAddIncomeAmount("");
    setAddIncomeNotes("");
    setShowAddIncome(false);
    setAddIncomeLoading(false);
  }

  async function handleEntryUpdate(entryId: string, updates: { isPaid?: boolean; amount?: number; notes?: string; paidAmount?: number; cashbackAmount?: number }) {
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
    if (updates.amount !== undefined || updates.cashbackAmount !== undefined) {
      setRecentMonths(prev => prev.map(m =>
        m.id === currentMonth!.id
          ? { ...m, entries: m.entries.map(e => e.id === entryId ? { ...e, ...(updates.amount !== undefined && { amount: updates.amount }), ...(updates.cashbackAmount !== undefined && { cashbackAmount: updates.cashbackAmount }) } : e) }
          : m
      ));
    }
    if (updates.isPaid !== undefined) toast.success(updates.isPaid ? "Marked paid ✓" : "Marked pending");
    if (updates.paidAmount !== undefined && !updated.isPaid) toast.success("Partial payment recorded");
    if (updates.cashbackAmount !== undefined) toast.success(`Cashback of ${formatCurrency(updates.cashbackAmount)} applied`);
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
    setRecentMonths(prev => prev.map(m =>
      m.id === currentMonth!.id
        ? { ...m, adHocItems: [...m.adHocItems, { id: newItem.id, type: newItem.type, amount: newItem.amount, category: newItem.category }] }
        : m
    ));
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
    setRecentMonths(prev => prev.map(m =>
      m.id === currentMonth!.id
        ? { ...m, adHocItems: m.adHocItems.filter(i => i.id !== id) }
        : m
    ));
    toast.success("Removed");
  }

  async function handleClearStatement(entryId: string) {
    if (!currentMonth) return;
    const res = await fetch(`/api/months/${currentMonth.id}/entries`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId, statementAmount: 0 }),
    });
    if (!res.ok) { toast.error("Failed to clear"); return; }
    setCurrentMonth(prev => prev ? {
      ...prev,
      entries: prev.entries.map(e => e.id === entryId ? { ...e, statementAmount: 0 } : e),
    } : prev);
    toast.success("Cleared");
  }

  async function handleSetupMonth(salaryIncome: number) {
    const res = await fetch("/api/months", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: viewMonth, year: viewYear, salaryIncome }),
    });
    if (!res.ok) { toast.error("Failed to set up month"); return; }
    const { id: monthId } = await res.json();
    const monthRes = await fetch(`/api/months/${monthId}`);
    if (!monthRes.ok) { toast.error("Failed to load month data"); return; }
    const fullMonth = await monthRes.json();
    setCurrentMonth(fullMonth);
    setShowSetup(false);
    setRecentMonths(prev => {
      if (prev.some(m => m.id === fullMonth.id)) return prev;
      return [{
        id: fullMonth.id, month: fullMonth.month, year: fullMonth.year,
        salaryIncome: fullMonth.salaryIncome, freelanceIncome: fullMonth.freelanceIncome, otherIncome: fullMonth.otherIncome,
        entries: (fullMonth.entries ?? []).map((e: EntryWithTemplate) => ({ id: e.id, templateId: e.templateId, amount: e.amount, cashbackAmount: e.cashbackAmount })),
        adHocItems: (fullMonth.adHocItems ?? []).map((i: AdHocItem) => ({ id: i.id, type: i.type, amount: i.amount, category: i.category })),
      }, ...prev].slice(0, 6);
    });
    toast.success("Month ready");
  }

  if (!currentMonth && !isProjected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        {prevUrl && nextUrl && (
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => navigate(prevUrl)} disabled={isPending} className="p-1.5 rounded-lg border hover:bg-muted transition-colors disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => navigate(nextUrl)} disabled={isPending} className="p-1.5 rounded-lg border hover:bg-muted transition-colors disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
        <h2 className="text-2xl font-bold">{formatMonthYear(viewMonth, viewYear)}</h2>
        <p className="text-muted-foreground">Set up this month to start tracking</p>
        <Button onClick={() => setShowSetup(true)}>
          <Plus className="w-4 h-4 mr-2" /> Set Up {formatMonthYear(viewMonth, viewYear)}
        </Button>
        <SetupMonthDialog open={showSetup} onOpenChange={setShowSetup} month={viewMonth} year={viewYear} suggestedIncome={suggestedIncome} onConfirm={handleSetupMonth} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DashboardTour />
      {/* Header */}
      <div className="space-y-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">This Month</p>

        <div className="flex items-center gap-2">
          {/* Month navigation pill */}
          {prevUrl && nextUrl ? (
            <div className={cn("flex items-center flex-1 rounded-xl border bg-muted/40 overflow-hidden transition-opacity", isPending && "opacity-50")}>
              <button
                onClick={() => navigate(prevUrl)}
                onMouseEnter={() => router.prefetch(prevUrl)}
                disabled={isPending}
                className="flex items-center justify-center h-10 px-3 hover:bg-muted transition-colors disabled:cursor-not-allowed shrink-0"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>

              <div className="flex-1 flex items-center justify-center gap-2 py-2">
                <span className="text-base font-bold">{formatMonthYear(viewMonth, viewYear)}</span>
                {isProjected && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                    Projected
                  </span>
                )}
              </div>

              <button
                onClick={() => navigate(nextUrl)}
                onMouseEnter={() => router.prefetch(nextUrl)}
                disabled={isPending}
                className="flex items-center justify-center h-10 px-3 hover:bg-muted transition-colors disabled:cursor-not-allowed shrink-0"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold">{formatMonthYear(viewMonth, viewYear)}</span>
                {isProjected && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                    Projected
                  </span>
                )}
              </div>
            </div>
          )}

          {!isProjected && (
            <Button onClick={() => setShowAdHoc(true)} size="sm" variant="outline" className="gap-1.5 shrink-0 h-10">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Transaction</span>
            </Button>
          )}
        </div>

        {!isProjected && pendingCount === 0 && (
          <p className="text-sm text-muted-foreground">All paid</p>
        )}
      </div>

      {/* FY Summary Strip */}
      {recentMonths.length > 1 && (
        <Card className="bg-slate-900 text-white border-slate-800">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Last {recentMonths.length} months</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-slate-400">Income</p>
                <p className="text-sm font-bold text-green-400">{fmt(fyIncome)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Expenses</p>
                <p className="text-sm font-bold text-red-400">{fmt(fyExpenses)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">{fyBalance >= 0 ? "Leftover" : "Deficit"}</p>
                <p className={cn("text-sm font-bold", fyBalance >= 0 ? "text-green-400" : "text-red-400")}>
                  {fyBalance >= 0 ? "+" : "-"}{fmt(Math.abs(fyBalance))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isProjected ? (
          <MetricCard label="Est. Income" value={fmt(dispIncome)} icon={<Wallet className="w-4 h-4" />} color="text-green-600" sub="projected" gradient="linear-gradient(135deg, white 0%, #f0fdf4 100%)" />
        ) : (
          <button onClick={openIncomeEdit} className="text-left">
            <Card className="hover:border-zinc-400 transition-colors cursor-pointer h-full" style={{ background: "linear-gradient(135deg, white 0%, #f0fdf4 100%)" }}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">Income</p>
                  <div className="flex items-center gap-1">
                    <span className="text-green-600"><Wallet className="w-4 h-4" /></span>
                    <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-base font-bold">{fmt(grandIncome)}</p>
                {(currentMonth!.freelanceIncome > 0 || adHocIncome > 0) && (
                  <p className="text-[10px] text-green-600 mt-0.5">
                    +{fmt(currentMonth!.freelanceIncome + adHocIncome)} extra
                  </p>
                )}
              </CardContent>
            </Card>
          </button>
        )}
        <MetricCard label="Spending" value={fmt(dispCommitted)} icon={<TrendingDown className="w-4 h-4" />} color="text-red-600" sub={isProjected ? `${projEntries.length} items` : pendingCount > 0 ? `${pendingCount} pending` : undefined} gradient="linear-gradient(135deg, white 0%, #fef2f2 100%)" />
        <MetricCard
          label="Extra Spending"
          value={isProjected ? "—" : fmt(adHocExpense)}
          icon={<CheckCircle2 className="w-4 h-4" />}
          color="text-amber-600"
          sub={isProjected ? "not yet tracked" : adHocExpense > 0 ? `${adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").length} transaction${adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").length !== 1 ? "s" : ""}` : "no extra expenses"}
          gradient="linear-gradient(135deg, white 0%, #fffbeb 100%)"
        />
        <MetricCard
          label={dispBalance >= 0 ? "Est. Leftover" : "Est. Deficit"}
          value={fmt(Math.abs(dispBalance))}
          icon={dispBalance >= 0 ? <TrendingUp className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          color={dispBalance >= 0 ? "text-green-600" : "text-red-600"}
          sub={isProjected ? "if no extra expenses" : dispBalance >= 0 ? "after all expenses" : "exceeds income"}
          gradient={dispBalance >= 0 ? "linear-gradient(135deg, white 0%, #f0fdf4 100%)" : "linear-gradient(135deg, white 0%, #fef2f2 100%)"}
        />
      </div>

      {/* CC carry-forward summary */}
      {ccStatementTotal > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            <span className="text-sm text-blue-800 font-medium">Rolls into {nextMonthName}&apos;s bill</span>
          </div>
          <span className="text-sm text-blue-900 font-bold">{fmt(ccStatementTotal)}</span>
        </div>
      )}

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{isProjected ? "Paid: none" : `Paid ${fmt(totalPaid)}`}</span>
          <span className="font-semibold text-foreground">{dispPaidPct}%</span>
          <span>{isProjected ? `Projected ${fmt(dispPending)}` : `Pending ${fmt(dispPending)}`}</span>
        </div>
        <Progress value={dispPaidPct} className="h-1.5" />
      </div>

      {/* Two-column layout on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Entries */}
        <div className="lg:col-span-2 space-y-4">
          {Object.entries(grouped).map(([groupKey, items]) => {
            const firstEntry   = items.find(i => i.kind === "entry");
            const firstProj    = items.find(i => i.kind === "projected");
            const sampleCat = firstEntry?.kind === "entry"
              ? { cat: firstEntry.data.template.category, custom: firstEntry.data.template.customCategory }
              : firstProj?.kind === "projected"
                ? { cat: firstProj.data.category, custom: firstProj.data.customCategory }
                : { cat: groupKey, custom: null };
            const catColor = getCategoryColor(sampleCat.cat, sampleCat.custom);
            const catLabel = getCategoryDisplay(sampleCat.cat, sampleCat.custom);
            const entryItems    = items.filter(i => i.kind === "entry") as { kind: "entry"; data: EntryWithTemplate }[];
            const projectedItems = items.filter(i => i.kind === "projected") as { kind: "projected"; data: ProjectedEntry }[];
            const txItems = items.filter(i => i.kind === "transaction").map(i => i.data as AdHocItem);
            const catTotal = isProjected
              ? projectedItems.reduce((s, i) => s + i.data.amount, 0)
              : entryItems.filter(i => !isBillPending(i.data)).reduce((s, i) => s + net(i.data), 0);
            const catPaid  = entryItems.reduce((s, i) => s + effectivePaid(i.data), 0);
            const catCarry = entryItems.reduce((s, i) => s + (i.data.statementAmount ?? 0), 0);
            const allPaid  = !isProjected && entryItems.length > 0 && entryItems.every(i => i.data.isPaid);
            const collapsed = isGroupCollapsed(groupKey, entryItems);
            const isCC = groupKey === "CREDIT_CARD";

            return (
              <div key={groupKey} className="relative pl-3">
                {/* Left accent strip */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full"
                  style={{ backgroundColor: catColor, opacity: 0.5 }}
                />

                {/* Clickable header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(groupKey, entryItems)}
                  className="w-full flex items-center justify-between mb-1.5 px-2 py-1.5 rounded-lg transition-colors hover:bg-muted/40"
                  style={{ background: collapsed ? undefined : `linear-gradient(to right, ${catColor}12, transparent)` }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {catLabel}
                    </span>
                    {allPaid && collapsed && (
                      <span className="text-[10px] text-green-600 font-medium ml-1">✓</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isProjected ? (
                      <span className="text-xs text-muted-foreground">{fmt(catTotal)}</span>
                    ) : collapsed ? (
                      <span className="text-xs text-muted-foreground">
                        {allPaid
                          ? `${entryItems.length} paid · ${fmt(catTotal)}`
                          : isCC
                            ? `${fmt(catTotal)} billed`
                            : `${fmt(catPaid)} / ${fmt(catTotal)}`}
                      </span>
                    ) : isCC ? (
                      <span className="text-xs text-muted-foreground">
                        {fmt(catTotal)} billed
                        {catCarry > 0 && <span className="text-blue-500"> · ↗ {fmt(catCarry)} {nextMonthName}</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {fmt(catPaid)} / {fmt(catTotal)}
                      </span>
                    )}
                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200", !collapsed && "rotate-180")} />
                  </div>
                </button>

                {/* Collapsible content */}
                {!collapsed && (
                  <div className="space-y-2">
                    {projectedItems.map((item, idx) => (
                      <ProjectedEntryRow key={idx} entry={item.data} />
                    ))}
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
                            isBillPending={isBillPending(item.data)}
                            onUpdate={handleEntryUpdate}
                            onDelete={handleAdHocDelete}
                            onClearStatement={handleClearStatement}
                          />
                        );
                      }
                      return <EntryRow key={item.data.id} entry={item.data} onUpdate={handleEntryUpdate} />;
                    })}
                    {!isCC && txItems.map(item =>
                      <TransactionRow key={item.id} item={item} onDelete={handleAdHocDelete} />
                    )}

                    {/* Orphaned CC transactions */}
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
                )}
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
          {!isProjected && <PaidSummaryPanel entries={entries} totalCommitted={totalCommitted} grandIncome={grandIncome} adHocExpense={adHocExpense} fmt={fmt} />}
          <DashboardCharts
            trendData={trendData}
            savingsRate={dispSavings}
            expensesDelta={isProjected ? null : expensesDelta}
            prevMonthName={isProjected ? null : prevMonthName}
            fixedAmount={dispFixed}
            variableAmount={dispVariable}
          />
        </div>
      </div>

      {/* Unified Income Dialog */}
      <Dialog open={!isProjected && showIncomeEdit} onOpenChange={v => { setShowIncomeEdit(v); if (!v) setShowAddIncome(false); }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Income: {formatMonthYear(currentMonth?.month ?? viewMonth, currentMonth?.year ?? viewYear)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {/* Base (template) income */}
            <div className="rounded-xl bg-muted/30 border px-3 py-3 space-y-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Monthly income</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Salary (₹)</Label>
                  <Input type="number" value={salaryVal} onChange={e => setSalaryVal(e.target.value)} placeholder="0" autoFocus className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Freelance / Bonus (₹)</Label>
                  <Input type="number" value={freelanceVal} onChange={e => setFreelanceVal(e.target.value)} placeholder="0 (optional)" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Other Income (₹)</Label>
                  <Input type="number" value={otherVal} onChange={e => setOtherVal(e.target.value)} placeholder="0 (optional)" className="mt-1" />
                </div>
              </div>
              <Button onClick={handleSaveIncome} disabled={incomeLoading} size="sm" className="w-full">
                {incomeLoading ? "Saving..." : "Update"}
              </Button>
            </div>

            {/* One-time income items */}
            {adHocItems.filter(i => i.type === "INCOME").length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">One-time income</p>
                {adHocItems.filter(i => i.type === "INCOME").map(item => (
                  <div key={item.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-card">
                    <div className="w-0.5 h-7 rounded-full bg-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(item.date), "dd MMM")}
                        {item.notes && item.notes !== "carry_forward" ? ` · ${item.notes}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-green-600 shrink-0">+{fmt(item.amount)}</span>
                    <Button variant="ghost" size="sm" onClick={() => handleAdHocDelete(item.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add one-time income */}
            {showAddIncome ? (
              <div className="rounded-xl border p-3 space-y-3">
                <p className="text-xs font-semibold">Add one-time income</p>
                <div className="flex flex-wrap gap-1.5">
                  {INCOME_SOURCES.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setAddIncomeSource(s.value)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                        addIncomeSource === s.value ? "bg-zinc-900 text-white border-zinc-900" : "border-border text-muted-foreground hover:border-zinc-500"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div>
                  <Label className="text-xs">Amount (₹)</Label>
                  <Input
                    type="number"
                    value={addIncomeAmount}
                    onChange={e => setAddIncomeAmount(e.target.value)}
                    placeholder="0"
                    autoFocus
                    className="mt-1"
                    onKeyDown={e => { if (e.key === "Enter") handleAddOneTimeIncome(); }}
                  />
                </div>
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={addIncomeDate} onChange={e => setAddIncomeDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Input value={addIncomeNotes} onChange={e => setAddIncomeNotes(e.target.value)} placeholder="e.g. Q2 bonus" className="mt-1" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowAddIncome(false); setAddIncomeAmount(""); setAddIncomeNotes(""); }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    disabled={!addIncomeAmount || addIncomeLoading}
                    onClick={handleAddOneTimeIncome}
                  >
                    {addIncomeLoading ? "Adding..." : "Add"}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddIncome(true)}
                className="w-full text-xs text-muted-foreground hover:text-foreground py-2.5 rounded-xl border border-dashed transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add one-time income
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {!isProjected && (
        <AdHocDialog
          open={showAdHoc}
          onOpenChange={setShowAdHoc}
          onAdd={handleAdHocAdd}
          ccCards={ccTemplates.map(t => ({ templateId: t.id, name: t.name } satisfies CCCard))}
        />
      )}
    </div>
  );
}

function MetricCard({ label, value, icon, color, sub, gradient }: { label: string; value: string; icon: React.ReactNode; color: string; sub?: string; gradient?: string }) {
  return (
    <Card style={gradient ? { background: gradient } : undefined}>
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

function ProjectedEntryRow({ entry }: { entry: ProjectedEntry }) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-card opacity-75">
      <div className="w-0.5 h-7 rounded-full shrink-0 bg-zinc-300" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{entry.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {entry.dueDateDay ? `due ${entry.dueDateDay}th` : "projected"}
          {entry.isFixed ? " · fixed" : ""}
        </p>
      </div>
      <span className="text-sm font-semibold text-muted-foreground shrink-0">
        {fmt(entry.amount)}
      </span>
    </div>
  );
}

function PaidSummaryPanel({ entries, totalCommitted, grandIncome, adHocExpense, fmt }: { entries: EntryWithTemplate[]; totalCommitted: number; grandIncome: number; adHocExpense: number; fmt: (v: number) => string }) {
  const [collapsed, setCollapsed] = useState(false);
  const netAmt = (e: EntryWithTemplate) => e.amount - (e.cashbackAmount ?? 0);
  const paidAmt = (e: EntryWithTemplate): number => e.isPaid ? (e.paidAmount ?? netAmt(e)) : (e.paidAmount ?? 0);

  // Include fully paid + partially paid entries
  const shown = entries.filter(e => e.isPaid || (e.paidAmount != null && e.paidAmount > 0));
  if (!shown.length) return null;

  // Group by category, preserving CATEGORY_ORDER then custom categories
  const groups: { key: string; label: string; color: string; items: EntryWithTemplate[] }[] = [];
  const seen = new Set<string>();
  for (const cat of CATEGORY_ORDER) {
    const items = shown.filter(e => e.template.category === cat && !e.template.customCategory);
    if (items.length) {
      groups.push({ key: cat, label: getCategoryDisplay(cat, null), color: getCategoryColor(cat, null), items });
      seen.add(cat);
    }
  }
  for (const e of shown) {
    if (e.template.customCategory && !seen.has(e.template.customCategory)) {
      const items = shown.filter(p => p.template.customCategory === e.template.customCategory);
      groups.push({ key: e.template.customCategory, label: e.template.customCategory, color: getCategoryColor(e.template.category, e.template.customCategory), items });
      seen.add(e.template.customCategory);
    }
  }

  const totalPaidOut = shown.reduce((s, e) => s + paidAmt(e), 0);
  const partialEntries = entries.filter(e => !e.isPaid && e.paidAmount != null && e.paidAmount > 0);
  const partialTotal = partialEntries.reduce((s, e) => s + (e.paidAmount ?? 0), 0);
  const fullyPaidCount = entries.filter(e => e.isPaid).length;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold">Paid</span>
              <span className="text-xs text-muted-foreground">{fullyPaidCount} of {entries.length}</span>
              {partialEntries.length > 0 && (
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                  {partialEntries.length} partial payment{partialEntries.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {fmt(totalPaidOut)} of {fmt(totalCommitted)}
              {partialTotal > 0 && <span className="text-amber-600 ml-1">· {fmt(partialTotal)} in partials</span>}
            </p>
          </div>
        </div>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ml-2", !collapsed && "rotate-180")} />
      </button>

      {!collapsed && (
        <div className="border-t border-border">
          {groups.map(g => {
            const subtotal = g.items.reduce((s, e) => s + paidAmt(e), 0);
            return (
              <div key={g.key} className="px-4 py-2.5 border-b border-border/50 last:border-b-0">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">{g.label}</span>
                  <span className="text-xs font-semibold tabular-nums">{fmt(subtotal)}</span>
                </div>
                <div className="space-y-1.5 pl-3">
                  {g.items.map(e => {
                    const isPartial = !e.isPaid && e.paidAmount != null && e.paidAmount > 0;
                    const remaining = netAmt(e) - (e.paidAmount ?? 0);
                    return (
                      <div key={e.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs text-muted-foreground truncate">{e.template.name}</span>
                          {isPartial && (
                            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1 py-0.5 rounded shrink-0">partial payment</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {e.cashbackAmount ? (
                            <span className="text-[10px] text-green-600">-{fmt(e.cashbackAmount)} cb</span>
                          ) : null}
                          {isPartial && (
                            <span className="text-[10px] text-muted-foreground">{fmt(remaining)} left</span>
                          )}
                          {!isPartial && e.paidOn && (
                            <span className="text-[10px] text-muted-foreground/70">{format(new Date(e.paidOn), "do MMM")}</span>
                          )}
                          <span className={cn("text-xs font-semibold tabular-nums", isPartial && "text-amber-600")}>
                            {fmt(paidAmt(e))}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-4 py-2.5 bg-green-50/60 border-t border-border/40">
            <span className="text-xs font-semibold text-muted-foreground">Total paid out</span>
            <span className="text-sm font-bold text-green-600 tabular-nums">{fmt(totalPaidOut)} of {fmt(totalCommitted)}</span>
          </div>
          {grandIncome > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50/80 border-t border-emerald-100">
              <span className="text-xs font-semibold text-emerald-700">Balance remaining</span>
              <span className={cn("text-sm font-bold tabular-nums", grandIncome - totalPaidOut - adHocExpense >= 0 ? "text-emerald-700" : "text-red-600")}>
                {fmt(grandIncome - totalPaidOut - adHocExpense)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TransactionRow({ item, onDelete }: { item: AdHocItem; onDelete: (id: string) => void }) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const isCarryForward = item.notes === "carry_forward";
  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-card",
      isCarryForward && "border-amber-200 bg-amber-50/40"
    )}>
      <div className={cn("w-0.5 h-7 rounded-full shrink-0", item.type === "INCOME" ? "bg-green-600" : "bg-red-600")} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium">{item.name}</p>
          {isCarryForward && (
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1 py-0.5 rounded">carried fwd</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {format(new Date(item.date), "dd MMM")}
          {item.notes && !isCarryForward ? ` · ${item.notes}` : ""}
        </p>
      </div>
      <span className={cn("text-sm font-semibold shrink-0", item.type === "INCOME" ? "text-green-600" : "text-red-600")}>
        {item.type === "INCOME" ? "+" : "-"}{fmt(item.amount)}
      </span>
      <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600">
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
