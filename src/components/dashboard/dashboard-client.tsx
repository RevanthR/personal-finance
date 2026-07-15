"use client";

import { useState, useMemo, useTransition, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { formatCurrency, formatMonthYear, getCategoryDisplay, getCategoryColor, MONTHS, pendingAmountKicks, ordinal } from "@/lib/utils";
import { netAmount as _net, effectivePaid as _effectivePaid, isBillPending as _isBillPending, computeMetrics, computeMonthIncome } from "@/lib/finance-utils";
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
  CheckCircle2, Plus, Pencil, ChevronDown, Trash2, ChevronLeft, ChevronRight, IndianRupee, Check, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { EntryRow } from "./entry-row";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryCard } from "@/components/ui/summary-card";
import { PageHeader } from "@/components/ui/page-header";
import { PaymentDialog } from "./payment-dialog";
import { usePaymentTick } from "@/hooks/use-payment-tick";
import { DashboardTour } from "@/components/coach/dashboard-tour";
import type { CCCard, AdHocSubmitFields } from "./adhoc-dialog";
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

type IncomeTemplate = {
  id: string;
  name: string;
  amount: number;
  pendingAmount: number | null;
  pendingFromMonth: number | null;
  pendingFromYear: number | null;
};

interface DashboardClientProps {
  currentMonth: MonthWithDetails | null;
  recentMonths: RecentMonthSummary[];
  ccTemplates: { id: string; name: string; statementDay: number | null; dueDateDay: number | null }[];
  customCategories: { id: string; name: string }[];
  incomeTemplates: IncomeTemplate[];
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
  adHocItems: { id: string; type: string; amount: number; category: string | null; notes: string | null }[];
};

type EntryWithTemplate = {
  id: string; amount: number; isPaid: boolean; paidOn: string | null; paidAmount: number | null; cashbackAmount: number | null; notes: string | null; templateId: string;
  statementAmount: number | null; billedAmount: number | null;
  template: { id: string; name: string; category: string; customCategory: string | null; isFixed: boolean; dueDateDay: number | null; statementDay: number | null; loanInterestRate: number | null; loanRateType: string | null; loanOriginalPrincipal: number | null; loanStartDate: string | null; loanOutstandingOverride: number | null };
};

type AdHocItem = {
  id: string; name: string; amount: number; type: string; category: string | null; customCategory: string | null; date: string; notes: string | null; ccTemplateId: string | null;
};


const CATEGORY_ORDER = ["HOUSE_MAINTENANCE", "LOAN", "CREDIT_CARD", "CHIT_FUND", "SAVINGS", "PERSONAL", "MISCELLANEOUS"];

const INCOME_SOURCES = [
  { value: "bonus",     label: "Bonus",     dbCategory: "OTHER_INCOME" },
  { value: "freelance", label: "Freelance", dbCategory: "FREELANCE" },
  { value: "refund",    label: "Refund",    dbCategory: "OTHER_INCOME" },
  { value: "other",     label: "Other",     dbCategory: "OTHER_INCOME" },
];

const CC_SUBCATEGORIES = ["Food", "Coffee", "Groceries", "Fuel", "Shopping", "Travel", "Health", "Bills", "Entertainment", "Other"];

// Smoothly animates category cards sliding to their new position (e.g. a
// fully-settled category sinking down) using the native View Transitions
// API. flushSync forces the DOM to reach its "after" state synchronously
// inside the transition so the browser can diff and animate it. No-ops
// (plain update) on browsers that don't support it.
function withReorderTransition(update: () => void) {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
      flushSync(update);
    });
  } else {
    update();
  }
}

// Thin wrappers so all local call-sites work unchanged
function net(e: EntryWithTemplate)                                              { return _net(e); }
function effectivePaid(e: EntryWithTemplate)                                    { return _effectivePaid(e); }
function isBillPending(e: EntryWithTemplate, isCurrent: boolean, day: number)   { return _isBillPending(e, isCurrent, day); }

function parseCCSubcat(notes: string | null): string {
  if (!notes) return "Other";
  for (const part of notes.split(" · ")) {
    if (CC_SUBCATEGORIES.includes(part)) return part;
  }
  return "Other";
}

function CCSubcatBreakdown({ txItems, onDelete, onEditRequest, removingIds }: { txItems: AdHocItem[]; onDelete: (id: string) => void; onEditRequest?: (item: AdHocItem) => void; removingIds: Set<string> }) {
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
              className="w-full flex items-center justify-between py-3 hover:bg-muted/50 rounded px-2 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{subcat}</span>
                <span className="text-xs text-muted-foreground/60">({txs.length})</span>
              </div>
              <span className="text-xs text-muted-foreground font-medium">{fmt(subtotal)}</span>
            </button>
            {open && (
              <div className="space-y-1 mt-1 mb-1">
                {txs.map(t => <TransactionRow key={t.id} item={t} onDelete={onDelete} onEditRequest={onEditRequest} isRemoving={removingIds.has(t.id)} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CCCardBlock({
  entry, txItems, nextMonthName, isBillPending, onUpdate, onDelete, onEditRequestTx, onClearStatement, removingIds, collapsed, onToggle,
}: {
  entry: EntryWithTemplate;
  txItems: AdHocItem[];
  nextMonthName: string;
  isBillPending: boolean;
  onUpdate: (id: string, updates: { isPaid?: boolean; amount?: number; notes?: string; paidAmount?: number; cashbackAmount?: number }) => Promise<void>;
  onDelete: (id: string) => void;
  onEditRequestTx?: (item: AdHocItem) => void;
  onClearStatement: (entryId: string) => Promise<void>;
  removingIds: Set<string>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const statementDay = entry.template.statementDay;
  const nextBillTotal = entry.statementAmount ?? 0;
  const billedTotal = entry.billedAmount ?? entry.amount;
  const isDueNextMonth = statementDay != null && entry.template.dueDateDay != null && entry.template.dueDateDay < statementDay;
  // Single shared tick instance — used by both the collapsed header's tick
  // and the expanded EntryRow's tick, so they never fall out of sync.
  const tick = usePaymentTick(entry, onUpdate);
  // Next-cycle charge list can get long — collapsed by default, independent
  // of the card's own collapse state.
  const [nextCycleCollapsed, setNextCycleCollapsed] = useState(true);

  // Pre-close txs bumped entry.amount; post-close go to next bill
  const preCloseTxs = statementDay
    ? txItems.filter(t => new Date(t.date).getDate() <= statementDay)
    : [];
  const postCloseTxs = statementDay
    ? txItems.filter(t => new Date(t.date).getDate() > statementDay)
    : txItems;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Card header — click to expand/collapse the whole card.
          A plain div (not a button) since it hosts the nested tick button below. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors cursor-pointer",
          !collapsed && "border-b border-border"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Tap to tick — opens the same pay dialog as before, right from the header.
              Same 44px-target / visible-circle pattern as every other tick in the app. */}
          <button
            type="button"
            disabled={isBillPending}
            onClick={e => { e.stopPropagation(); tick.handleTickClick(); }}
            className="shrink-0 flex items-center justify-center w-9 h-9 -m-2 rounded-full disabled:cursor-default"
          >
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all pointer-events-none",
              tick.isPaid
                ? "bg-positive border-positive"
                : isBillPending
                  ? "border-primary/40 bg-accent"
                  : tick.isPartial
                    ? "border-warning bg-warning-bg"
                    : "border-warning/70 bg-warning-bg/40"
            )}>
              {tick.isPaid && <Check className="w-3 h-3 text-white" />}
              {tick.isPartial && <span className="w-1.5 h-1.5 rounded-full bg-warning" />}
            </div>
          </button>
          <div className="flex flex-col items-start min-w-0 text-left">
            <span className="text-xs font-semibold truncate max-w-full">{entry.template.name}</span>
            {statementDay && (
              <span className="text-[10px] text-muted-foreground">closes {ordinal(statementDay)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Amount, due date — permanently in the header, not a separate row */}
          <div className="flex flex-col items-end">
            <span className={cn("flex items-center gap-1.5 text-xs font-semibold tabular-nums", tick.isPaid && "text-muted-foreground line-through")}>
              {nextBillTotal > 0 && <span className="text-warning font-normal">↗ {fmt(nextBillTotal)} ·</span>}
              {tick.isPartial ? fmt(tick.outstanding) : tick.cashback > 0 && !tick.isPaid ? fmt(tick.netBill) : fmt(billedTotal)}
            </span>
            {tick.isPartial ? (
              <span className="text-[10px] text-warning">{fmt(tick.paidAmount!)} paid so far</span>
            ) : entry.template.dueDateDay && (
              <span className="text-[10px] text-warning">
                due {ordinal(entry.template.dueDateDay)}{isDueNextMonth ? ` ${nextMonthName}` : ""}
              </span>
            )}
          </div>
          <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200 shrink-0", !collapsed && "rotate-180")} />
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Billed vs paying indicator — only when they differ */}
          {entry.billedAmount != null && entry.billedAmount > entry.amount && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border">
              <span className="text-xs text-warning">
                Statement <span className="font-semibold">{fmt(entry.billedAmount)}</span>
                {" · "}Rolling <span className="font-semibold">{fmt(entry.billedAmount - entry.amount)}</span> to next month
              </span>
            </div>
          )}

          {preCloseTxs.length > 0 && (
            <div className="p-2">
              <p className="text-xs text-muted-foreground font-medium px-1 mb-1">Added to this bill</p>
              <CCSubcatBreakdown txItems={preCloseTxs} onDelete={onDelete} onEditRequest={onEditRequestTx} removingIds={removingIds} />
            </div>
          )}

          {/* Next cycle charges — its own collapse, independent of the card's.
              Restrained to a plain neutral block with just the label/amount
              in amber, not a full tinted background wash over every row. */}
          {nextBillTotal > 0 && (
            <div className="border-t border-border px-3 py-2">
              <div
                onClick={postCloseTxs.length > 0 ? () => setNextCycleCollapsed(v => !v) : undefined}
                className={cn(
                  "flex items-center justify-between",
                  postCloseTxs.length > 0 && "cursor-pointer",
                  postCloseTxs.length > 0 && !nextCycleCollapsed && "mb-1.5"
                )}
              >
                <span className="text-xs font-semibold text-warning tracking-wide flex items-center gap-1">
                  → {nextMonthName} bill
                  {postCloseTxs.length > 0 && (
                    <ChevronDown className={cn("w-3 h-3 text-warning/60 transition-transform duration-200", !nextCycleCollapsed && "rotate-180")} />
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-warning tracking-tight">{fmt(nextBillTotal)}</span>
                  {postCloseTxs.length === 0 && (
                    <button
                      onClick={() => onClearStatement(entry.id)}
                      className="text-xs font-medium text-muted-foreground border border-border bg-card px-2.5 py-1 rounded-md hover:border-foreground/30 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {postCloseTxs.length > 0 && !nextCycleCollapsed && (
                <CCSubcatBreakdown txItems={postCloseTxs} onDelete={onDelete} onEditRequest={onEditRequestTx} removingIds={removingIds} />
              )}
            </div>
          )}
        </>
      )}

      {/* Owned here (not by EntryRow) so it works from the collapsed tick too */}
      <PaymentDialog tick={tick} entryName={entry.template.name} amount={entry.amount} fmt={fmt} />
    </div>
  );
}

export function DashboardClient({ currentMonth: initialMonth, recentMonths: initialRecentMonths, ccTemplates, customCategories, incomeTemplates, todayMonth, todayYear, targetMonth, targetYear, prevUrl, nextUrl, projectedIncome, projectedEntries }: DashboardClientProps) {
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
  const [editingItem, setEditingItem] = useState<AdHocItem | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [showSetup, setShowSetup] = useState(!initialMonth && !isProjected);
  const [showIncomeEdit, setShowIncomeEdit] = useState(false);

  // Add one-time income (inline inside income dialog)
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [addIncomeSource, setAddIncomeSource] = useState("bonus");
  const [addIncomeAmount, setAddIncomeAmount] = useState("");
  const [addIncomeDate, setAddIncomeDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [addIncomeNotes, setAddIncomeNotes] = useState("");
  const [addIncomeLoading, setAddIncomeLoading] = useState(false);

  // Per-month income template override
  const [editingIncomeTemplateId, setEditingIncomeTemplateId] = useState<string | null>(null);
  const [editingIncomeAmount, setEditingIncomeAmount] = useState("");
  const [incomeOverrideLoading, setIncomeOverrideLoading] = useState(false);

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

  const templateIncome = useMemo(() => {
    const overrides = new Map<string, number>();
    for (const item of adHocItems) {
      if (item.notes?.startsWith("income_override:")) {
        overrides.set(item.notes.slice("income_override:".length), item.amount);
      }
    }
    return incomeTemplates.reduce((sum, t) => {
      if (overrides.has(t.id)) return sum + overrides.get(t.id)!;
      return sum + (pendingAmountKicks(t, viewMonth, viewYear) ? t.pendingAmount! : t.amount);
    }, 0);
  }, [incomeTemplates, adHocItems, viewMonth, viewYear]);

  const hasCCCards = ccTemplates.length > 0;
  const adHocIncome   = useMemo(() => adHocItems.filter(i => i.type === "INCOME" && !i.notes?.startsWith("income_override:")).reduce((s, i) => s + i.amount, 0), [adHocItems]);
  const adHocExpense  = useMemo(() => adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").reduce((s, i) => s + i.amount, 0), [adHocItems]);
  const grandIncome   = templateIncome + adHocIncome;

  // Single-pass metric computation via shared finance-utils
  const metrics = useMemo(
    () => computeMetrics(entries, isCurrentMonth, todayDay),
    [entries, isCurrentMonth, todayDay],
  );
  const {
    totalCommitted, totalPaid, totalPending, paidPercent, pendingCount,
    ccBillsThisMonth, recurringNonCC, ccNextMonth,
  } = metrics;

  const balance   = grandIncome - totalCommitted - adHocExpense;
  const inHandNow = grandIncome - totalPaid - adHocExpense;

  const nonCCPaidAmount = useMemo(() =>
    entries.filter(e => e.template.category !== "CREDIT_CARD")
           .reduce((s, e) => s + effectivePaid(e), 0),
    [entries],
  );
  const nonCCPendingCount = useMemo(() =>
    entries.filter(e => e.template.category !== "CREDIT_CARD" && !e.isPaid).length,
    [entries],
  );
  const nonCCPaidPercent = recurringNonCC > 0 ? Math.round((nonCCPaidAmount / recurringNonCC) * 100) : 0;
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

    // Sort: pending first (by due date asc, then amount desc), paid last (by paidOn desc)
    const sortEntries = (a: EntryWithTemplate, b: EntryWithTemplate) => {
      if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
      if (!a.isPaid) {
        const aDue = a.template.dueDateDay ?? 999;
        const bDue = b.template.dueDateDay ?? 999;
        if (aDue !== bDue) return aDue - bDue;
        return net(b) - net(a);
      }
      if (a.paidOn && b.paidOn) return b.paidOn.localeCompare(a.paidOn);
      return a.paidOn ? -1 : b.paidOn ? 1 : 0;
    };

    // Template entries grouped by category
    for (const cat of CATEGORY_ORDER) {
      const items = entries.filter(e => e.template.category === cat && !e.template.customCategory).sort(sortEntries);
      if (items.length) result[cat] = items.map(d => ({ kind: "entry" as const, data: d }));
    }
    for (const e of entries) {
      if (e.template.customCategory) {
        const key = e.template.customCategory;
        if (!result[key]) result[key] = [];
        result[key].push({ kind: "entry", data: e });
      }
    }
    // Sort custom category groups too
    for (const key of Object.keys(result)) {
      if (!CATEGORY_ORDER.includes(key as typeof CATEGORY_ORDER[number])) {
        result[key] = result[key].sort((a, b) =>
          a.kind === "entry" && b.kind === "entry" ? sortEntries(a.data, b.data) : 0
        );
      }
    }

    // Merge categorised ad-hoc EXPENSE items into their group
    // Income items are shown in the income panel, not here
    const oneTime: AdHocItem[] = [];
    for (const item of adHocItems) {
      if (item.type === "INCOME") continue;
      if (item.type === "EXPENSE" && item.category) {
        const key = item.customCategory ?? item.category;
        if (result[key]) {
          result[key].push({ kind: "transaction", data: item });
        } else {
          result[key] = [{ kind: "transaction", data: item }];
        }
      } else {
        oneTime.push(item);
      }
    }

    // Sink fully-settled categories (all entries paid, no loose ad-hoc tx)
    // below groups that still need action. CATEGORY_ORDER / insertion order
    // is preserved as a stable tiebreak within each bucket.
    const isSettled = (items: GroupedItem[]) => {
      const entryItems = items.filter((i): i is { kind: "entry"; data: EntryWithTemplate } => i.kind === "entry");
      const txItems = items.filter(i => i.kind === "transaction");
      return entryItems.length > 0 && entryItems.every(i => i.data.isPaid) && txItems.length === 0;
    };
    const ordered: Record<string, GroupedItem[]> = {};
    for (const key of Object.keys(result).sort((a, b) => Number(isSettled(result[a])) - Number(isSettled(result[b])))) {
      ordered[key] = result[key];
    }

    return { grouped: ordered, oneTimeItems: oneTime };
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
      if (isBillPending(e, isCurrentMonth, todayDay)) continue;
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
    const ccStatementDayById = new Map(ccTemplates.map(t => [t.id, t.statementDay]));
    const monthIncome = (m: typeof recentMonths[0]) =>
      computeMonthIncome(m.adHocItems, incomeTemplates, m.month, m.year);
    const monthExpenses = (m: typeof recentMonths[0]) => {
      const isCurrent = m.month === todayMonth && m.year === todayYear;
      return m.entries.reduce((a, e) => {
        if (isCurrent) {
          const stDay = ccStatementDayById.get(e.templateId);
          if (stDay != null && todayDay < stDay) return a;
        }
        return a + e.amount - (e.cashbackAmount ?? 0);
      }, 0)
      + m.adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").reduce((a, i) => a + i.amount, 0);
    };

    const fyIncome   = recentMonths.reduce((s, m) => s + monthIncome(m), 0);
    const fyExpenses = recentMonths.reduce((s, m) => s + monthExpenses(m), 0);
    const trendData  = [...recentMonths].reverse().map(m => ({
      name: format(new Date(m.year, m.month - 1), "MMM"),
      Income: monthIncome(m),
      Expenses: monthExpenses(m),
    }));
    return { fyIncome, fyExpenses, fyBalance: fyIncome - fyExpenses, trendData };
  }, [recentMonths, incomeTemplates, ccTemplates, todayMonth, todayYear, todayDay]);

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
    const prevExp = prev.entries
      .reduce((s, e) => s + e.amount - (e.cashbackAmount ?? 0), 0)
      + prev.adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD").reduce((s, i) => s + i.amount, 0);
    return {
      prevMonthName: MONTHS[prev.month - 1],
      expensesDelta: (totalCommitted + adHocExpense) - prevExp,
    };
  }, [recentMonths, currentMonth, totalCommitted, adHocExpense]);

  const fixedAmount = useMemo(
    () => entries.filter(e => e.template.isFixed && !isBillPending(e, isCurrentMonth, todayDay)).reduce((s, e) => s + net(e), 0),
    [entries, isCurrentMonth, todayDay]
  );
  const variableAmount = totalCommitted - fixedAmount + adHocExpense;

  // Projected-mode display overrides — shadow the actual values when viewing a future month
  const dispIncome          = isProjected ? (projectedIncome ?? 0) : grandIncome;
  const dispCommitted       = isProjected ? projEntries.reduce((s, e) => s + e.amount, 0) : totalCommitted;
  const dispAdHoc           = isProjected ? 0 : adHocExpense;
  const dispBalance         = dispIncome - dispCommitted - dispAdHoc;
  const dispPaidPct         = isProjected ? 0 : paidPercent;
  const dispPending         = isProjected ? dispCommitted : totalPending;
  const dispFixed           = isProjected ? projEntries.filter(e => e.isFixed).reduce((s, e) => s + e.amount, 0) : fixedAmount;
  const dispVariable        = isProjected ? (dispCommitted - dispFixed) : variableAmount;
  const dispSavings         = dispIncome > 0 ? Math.round(((dispIncome - dispCommitted - dispAdHoc) / dispIncome) * 100) : 0;
  const dispRecurringNonCC  = isProjected ? projEntries.filter(e => e.category !== "CREDIT_CARD").reduce((s, e) => s + e.amount, 0) : recurringNonCC;
  const dispCCBills         = isProjected ? projEntries.filter(e => e.category === "CREDIT_CARD").reduce((s, e) => s + e.amount, 0) : ccBillsThisMonth;
  const dispNonCCPaidPct    = isProjected ? 0 : nonCCPaidPercent;
  const dispNonCCPending    = isProjected ? dispRecurringNonCC : (recurringNonCC - nonCCPaidAmount);

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

  // Collapsible groups: track user overrides; default = always collapsed
  const [groupToggled, setGroupToggled] = useState<Record<string, boolean>>({});
  function isGroupCollapsed(key: string, entryItems: { data: EntryWithTemplate }[]): boolean {
    if (key in groupToggled) return groupToggled[key];
    return true;
  }
  function toggleGroup(key: string, entryItems: { data: EntryWithTemplate }[]) {
    setGroupToggled(prev => ({ ...prev, [key]: !isGroupCollapsed(key, entryItems) }));
  }

  // Collapsible per-card body (current bill + next-cycle bill) within the CC category
  const [ccCardToggled, setCcCardToggled] = useState<Record<string, boolean>>({});
  function isCCCardCollapsed(entryId: string): boolean {
    return entryId in ccCardToggled ? ccCardToggled[entryId] : true;
  }
  function toggleCCCard(entryId: string) {
    setCcCardToggled(prev => ({ ...prev, [entryId]: !isCCCardCollapsed(entryId) }));
  }

  function openIncomeEdit() {
    if (!currentMonth) return;
    setShowAddIncome(false);
    setAddIncomeAmount("");
    setAddIncomeNotes("");
    setAddIncomeSource("bonus");
    setAddIncomeDate(new Date().toISOString().split("T")[0]);
    setShowIncomeEdit(true);
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

  async function handleIncomeOverride(template: IncomeTemplate, newAmount: number) {
    if (!currentMonth) return;
    setIncomeOverrideLoading(true);
    const existing = adHocItems.find(i => i.notes === `income_override:${template.id}`);
    if (existing) await handleAdHocDelete(existing.id);
    const date = `${currentMonth.year}-${String(currentMonth.month).padStart(2, "0")}-01`;
    await handleAdHocAdd({
      name: template.name, amount: newAmount, type: "INCOME",
      category: "OTHER_INCOME", date, notes: `income_override:${template.id}`,
    });
    setIncomeOverrideLoading(false);
    setEditingIncomeTemplateId(null);
    setEditingIncomeAmount("");
  }

  async function handleIncomeOverrideReset(templateId: string) {
    const existing = adHocItems.find(i => i.notes === `income_override:${templateId}`);
    if (existing) await handleAdHocDelete(existing.id);
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
    withReorderTransition(() => {
      setCurrentMonth(prev => prev ? {
        ...prev, entries: prev.entries.map(e => e.id === entryId ? { ...e, ...updated } : e),
      } : prev);
    });
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

  async function handleAdHocAdd(item: AdHocSubmitFields) {
    if (!currentMonth) return;
    const res = await fetch(`/api/months/${currentMonth.id}/adhoc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!res.ok) { toast.error("Failed to add"); return; }
    const { item: newItem, updatedEntry } = await res.json();
    withReorderTransition(() => {
      setCurrentMonth(prev => {
        if (!prev) return prev;
        const updatedEntries = updatedEntry
          ? prev.entries.map(e => e.id === updatedEntry.id ? { ...e, amount: updatedEntry.amount, statementAmount: updatedEntry.statementAmount } : e)
          : prev.entries;
        return { ...prev, adHocItems: [newItem, ...prev.adHocItems], entries: updatedEntries };
      });
    });
    setRecentMonths(prev => prev.map(m =>
      m.id === currentMonth!.id
        ? { ...m, adHocItems: [{ id: newItem.id, type: newItem.type, amount: newItem.amount, category: newItem.category, notes: newItem.notes ?? null }, ...m.adHocItems] }
        : m
    ));
    toast.success("Added");
    setShowAdHoc(false);
  }

  async function handleAdHocDelete(id: string) {
    if (!currentMonth) return;
    if (removingIds.has(id)) return; // already in flight — ignore a stray double-tap
    setRemovingIds(prev => new Set(prev).add(id));

    // let the exit transition play before the row actually leaves the list,
    // so a second tap can't land on whatever row slides up to take its place
    await new Promise(resolve => setTimeout(resolve, 180));

    const res = await fetch(`/api/months/${currentMonth.id}/adhoc?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove");
      setRemovingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      return;
    }
    const { updatedEntry } = await res.json();
    withReorderTransition(() => {
      setCurrentMonth(prev => {
        if (!prev) return prev;
        const updatedEntries = updatedEntry
          ? prev.entries.map(e => e.id === updatedEntry.id ? { ...e, amount: updatedEntry.amount, statementAmount: updatedEntry.statementAmount } : e)
          : prev.entries;
        return { ...prev, adHocItems: prev.adHocItems.filter(i => i.id !== id), entries: updatedEntries };
      });
    });
    setRecentMonths(prev => prev.map(m =>
      m.id === currentMonth!.id
        ? { ...m, adHocItems: m.adHocItems.filter(i => i.id !== id) }
        : m
    ));
    setRemovingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    toast.success("Removed");
  }

  async function handleAdHocEdit(id: string, fields: AdHocSubmitFields) {
    if (!currentMonth) return;
    const res = await fetch(`/api/months/${currentMonth.id}/adhoc`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    if (!res.ok) { toast.error("Failed to save"); return; }
    const { item: updated, updatedEntries } = await res.json();
    withReorderTransition(() => {
      setCurrentMonth(prev => {
        if (!prev) return prev;
        let entries = prev.entries;
        for (const ue of updatedEntries as { id: string; amount: number; statementAmount: number | null }[]) {
          entries = entries.map(e => e.id === ue.id ? { ...e, amount: ue.amount, statementAmount: ue.statementAmount } : e);
        }
        return { ...prev, adHocItems: prev.adHocItems.map(i => i.id === id ? { ...i, ...updated } : i), entries };
      });
    });
    setRecentMonths(prev => prev.map(m =>
      m.id === currentMonth!.id
        ? { ...m, adHocItems: m.adHocItems.map(i => i.id === id ? { ...i, type: updated.type, amount: updated.amount, category: updated.category, notes: updated.notes ?? null } : i) }
        : m
    ));
    toast.success("Updated");
    setEditingItem(null);
  }

  function handleEditRequest(item: AdHocItem) {
    setEditingItem(item);
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
      <div className="space-y-4">
      <PageHeader title="Dashboard" subtitle="This month's income, expenses, and bills" />
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
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
        <EmptyState
          icon={Calendar}
          title={formatMonthYear(viewMonth, viewYear)}
          titleClassName="text-2xl font-bold"
          description="Set up this month to start tracking"
          action={
            <Button onClick={() => setShowSetup(true)}>
              <Plus className="w-4 h-4 mr-2" /> Set Up {formatMonthYear(viewMonth, viewYear)}
            </Button>
          }
        />
        <SetupMonthDialog open={showSetup} onOpenChange={setShowSetup} month={viewMonth} year={viewYear} suggestedIncome={templateIncome} onConfirm={handleSetupMonth} />
      </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DashboardTour />
      <PageHeader title="Dashboard" subtitle="This month's income, expenses, and bills" />
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {/* Month navigation pill */}
          {prevUrl && nextUrl ? (
            <div className={cn("flex items-center flex-1 rounded-xl border bg-card overflow-hidden transition-opacity", isPending && "opacity-50")}>
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
                  <span className="text-xs font-semibold text-warning bg-warning-bg px-1.5 py-0.5 rounded-full">
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
                  <span className="text-xs font-semibold text-warning bg-warning-bg px-1.5 py-0.5 rounded-full">
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

      {/* Overview — Coin's compound summary-card pattern: one card, every
          top-line figure as a stat in the same row, instead of four
          separate bordered tiles. */}
      <SummaryCard
        tag={isProjected ? "Projected" : "This month"}
        stats={[
          {
            label: isProjected ? "Income" : <>Income<Pencil className="w-2.5 h-2.5 text-muted-foreground" /></>,
            value: isProjected ? fmt(dispIncome) : fmt(grandIncome),
            valueClass: "text-positive",
            onClick: isProjected ? undefined : openIncomeEdit,
            hint: isProjected
              ? <span className="text-xs text-muted-foreground">projected</span>
              : adHocIncome > 0
                ? <span className="text-xs text-positive">+{fmt(adHocIncome)} one-time</span>
                : undefined,
          },
          {
            label: "Recurring",
            value: fmt(dispRecurringNonCC),
            hint: <span className="text-xs text-muted-foreground">
              {isProjected ? `${projEntries.filter(e => e.category !== "CREDIT_CARD").length} items` : nonCCPendingCount > 0 ? `${nonCCPendingCount} pending` : "all paid"}
            </span>,
          },
          ...(hasCCCards ? [{
            label: "CC Bill",
            value: dispCCBills > 0 ? fmt(dispCCBills) : "—",
            hint: <span className="text-xs text-muted-foreground">{isProjected ? "last month's bill" : dispCCBills > 0 ? "from last month" : "no CC bills"}</span>,
          }] : []),
          ...(hasCCCards && !isProjected ? [{
            label: "CC Next Month",
            value: ccNextMonth > 0 ? fmt(ccNextMonth) : "—",
            hint: <span className="text-xs text-muted-foreground">{ccNextMonth > 0 ? `building for ${nextMonthName}` : "nothing yet"}</span>,
          }] : []),
          {
            label: "Pending",
            value: isProjected ? fmt(dispPending) : fmt(totalPending),
            valueClass: "text-negative",
            hint: isProjected
              ? <span className="text-xs text-muted-foreground">projected</span>
              : balance < 0
                ? <span className="text-xs text-negative">{fmt(Math.abs(balance))} over income</span>
                : undefined,
          },
          ...(!isProjected ? [{
            label: "Cash in Hand",
            value: fmt(Math.max(0, inHandNow)),
            valueClass: "text-positive",
          }] : []),
        ]}
      />

      {/* Progress — recurring + CC bill this month */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{isProjected ? "Paid: none" : `Paid ${fmt(totalPaid)}`}</span>
          <span className="font-semibold text-foreground">{dispPaidPct}%</span>
          <span>{isProjected ? `Projected ${fmt(dispPending)}` : `Pending ${fmt(Math.max(0, totalPending))}`}</span>
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
            const isCC     = groupKey === "CREDIT_CARD";
            const txTotal  = txItems.reduce((s, t) => s + t.amount, 0);
            const catTotal = isProjected
              ? projectedItems.reduce((s, i) => s + i.data.amount, 0)
              : entryItems.filter(i => !isBillPending(i.data, isCurrentMonth, todayDay)).reduce((s, i) => s + net(i.data), 0) + (isCC ? 0 : txTotal);
            const catCarry = entryItems.reduce((s, i) => s + (i.data.statementAmount ?? 0), 0);
            const catPaid  = entryItems.reduce((s, i) => s + effectivePaid(i.data), 0);
            const allPaid  = !isProjected && entryItems.length > 0 && entryItems.every(i => i.data.isPaid) && txItems.length === 0;
            const collapsed = isGroupCollapsed(groupKey, entryItems);

            return (
              <div
                key={groupKey}
                className="relative pl-3"
                style={{ viewTransitionName: `cat-${groupKey.replace(/[^a-zA-Z0-9-_]/g, "")}` } as CSSProperties}
              >
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
                      <span className="text-xs text-positive font-medium ml-1">✓</span>
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
                            : entryItems.length === 0
                              ? fmt(catTotal)
                              : `${fmt(catPaid)} / ${fmt(catTotal)}`}
                      </span>
                    ) : isCC ? (
                      <span className="text-xs text-muted-foreground">
                        {fmt(catTotal)} billed
                        {catCarry > 0 && <span className="text-warning"> · ↗ {fmt(catCarry)} {nextMonthName}</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {entryItems.length === 0 ? fmt(catTotal) : `${fmt(catPaid)} / ${fmt(catTotal)}`}
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
                        const cardTemplateId = item.data.templateId;
                        const cardTxs = txItems.filter(t => t.ccTemplateId === cardTemplateId);
                        return (
                          <CCCardBlock
                            key={item.data.id}
                            entry={item.data}
                            txItems={cardTxs}
                            nextMonthName={nextMonthName}
                            isBillPending={isBillPending(item.data, isCurrentMonth, todayDay)}
                            onUpdate={handleEntryUpdate}
                            onDelete={handleAdHocDelete}
                            onEditRequestTx={handleEditRequest}
                            onClearStatement={handleClearStatement}
                            removingIds={removingIds}
                            collapsed={isCCCardCollapsed(item.data.id)}
                            onToggle={() => toggleCCCard(item.data.id)}
                          />
                        );
                      }
                      return <EntryRow key={item.data.id} entry={item.data} onUpdate={handleEntryUpdate} />;
                    })}
                    {!isCC && txItems.map(item =>
                      <TransactionRow key={item.id} item={item} onDelete={handleAdHocDelete} onEditRequest={handleEditRequest} isRemoving={removingIds.has(item.id)} />
                    )}

                    {/* Orphaned CC transactions */}
                    {isCC && (() => {
                      const entryTemplateIds = new Set(entryItems.map(i => i.data.templateId));
                      const orphaned = txItems.filter(t => !t.ccTemplateId || !entryTemplateIds.has(t.ccTemplateId));
                      return orphaned.length > 0 ? (
                        <div className="mt-2 rounded-xl border border-dashed border-border px-3 py-2">
                          <p className="text-xs text-muted-foreground mb-1.5">Unmatched transactions</p>
                          <CCSubcatBreakdown txItems={orphaned} onDelete={handleAdHocDelete} onEditRequest={handleEditRequest} removingIds={removingIds} />
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
                  <TransactionRow key={item.id} item={item} onDelete={handleAdHocDelete} onEditRequest={handleEditRequest} isRemoving={removingIds.has(item.id)} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Recharts loaded lazily so it doesn't block navigation */}
        <div className="space-y-4">
          {/* FY summary — secondary context, sits above settlements */}
          {recentMonths.length > 1 && (
            <FYSummaryCard
              recentMonths={recentMonths}
              fyIncome={fyIncome}
              fyExpenses={fyExpenses}
              fyBalance={fyBalance}
              trendData={trendData}
              fmt={fmt}
            />
          )}
          {!isProjected && <PaidSummaryPanel entries={entries} totalCommitted={totalCommitted} grandIncome={grandIncome} adHocExpense={adHocExpense} adHocItems={adHocItems} fmt={fmt} />}
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
            {/* Recurring income from templates */}
            <div className="rounded-xl bg-muted/30 border px-3 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recurring</p>
                <span className="text-xs font-semibold text-positive">{fmt(templateIncome)}</span>
              </div>
              {incomeTemplates.length === 0 ? (
                <p className="text-xs text-muted-foreground">No recurring income configured.</p>
              ) : (
                <div className="space-y-1">
                  {incomeTemplates.map(t => {
                    const override = adHocItems.find(i => i.notes === `income_override:${t.id}`);
                    const baseAmt = !override && pendingAmountKicks(t, viewMonth, viewYear) ? t.pendingAmount! : t.amount;
                    const effectiveAmt = override ? override.amount : baseAmt;
                    const isEditing = editingIncomeTemplateId === t.id;

                    return (
                      <div key={t.id}>
                        {isEditing ? (
                          <div className="flex items-center gap-2 py-1">
                            <span className="text-sm flex-1 truncate">{t.name}</span>
                            <input
                              type="number"
                              autoFocus
                              value={editingIncomeAmount}
                              onChange={e => setEditingIncomeAmount(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") {
                                  const v = parseFloat(editingIncomeAmount);
                                  if (v > 0) handleIncomeOverride(t, v);
                                }
                                if (e.key === "Escape") { setEditingIncomeTemplateId(null); setEditingIncomeAmount(""); }
                              }}
                              className="w-28 text-right text-sm font-medium border rounded px-2 py-1 bg-background"
                              placeholder={fmt(effectiveAmt)}
                            />
                            <button
                              type="button"
                              disabled={incomeOverrideLoading || !editingIncomeAmount || parseFloat(editingIncomeAmount) <= 0}
                              onClick={() => { const v = parseFloat(editingIncomeAmount); if (v > 0) handleIncomeOverride(t, v); }}
                              className="text-xs font-medium text-positive hover:text-positive disabled:opacity-40"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingIncomeTemplateId(null); setEditingIncomeAmount(""); }}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between py-1">
                            <span className="text-sm">{t.name}</span>
                            <div className="flex items-center gap-1.5">
                              {override && (
                                <button
                                  type="button"
                                  onClick={() => handleIncomeOverrideReset(t.id)}
                                  className="text-xs text-muted-foreground active:text-negative p-1 -mr-1"
                                  title="Reset to template amount"
                                >
                                  ↺
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => { setEditingIncomeTemplateId(t.id); setEditingIncomeAmount(String(effectiveAmt)); }}
                                className={cn("text-sm font-medium tabular-nums px-1.5 py-0.5 rounded active:bg-muted transition-colors", override ? "text-warning" : "text-positive")}
                              >
                                {fmt(effectiveAmt)}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => { setShowIncomeEdit(false); router.push("/templates"); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Manage in Budgets →
              </button>
            </div>

            {/* One-time income items */}
            {adHocItems.filter(i => i.type === "INCOME" && !i.notes?.startsWith("income_override:")).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">One-time income</p>
                {adHocItems.filter(i => i.type === "INCOME" && !i.notes?.startsWith("income_override:")).map(item => (
                  <div key={item.id} className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-card transition-all duration-150",
                    removingIds.has(item.id) && "opacity-0 scale-95 pointer-events-none"
                  )}>
                    <div className="w-0.5 h-7 rounded-full bg-positive shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(item.date), "dd MMM")}
                        {item.notes && item.notes !== "carry_forward" ? ` · ${item.notes}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-positive shrink-0">+{fmt(item.amount)}</span>
                    <Button variant="ghost" size="sm" disabled={removingIds.has(item.id)} onClick={() => handleAdHocDelete(item.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-negative shrink-0">
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
                        addIncomeSource === s.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-muted-foreground"
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
                    className="flex-1 bg-positive hover:bg-positive"
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
          key={editingItem?.id ?? "new"}
          open={showAdHoc || editingItem !== null}
          onOpenChange={v => { if (!v) { setShowAdHoc(false); setEditingItem(null); } else setShowAdHoc(true); }}
          onAdd={handleAdHocAdd}
          onEdit={handleAdHocEdit}
          editing={editingItem}
          ccCards={ccTemplates.map(t => ({ templateId: t.id, name: t.name } satisfies CCCard))}
          customCategories={customCategories}
        />
      )}
    </div>
  );
}

function ProjectedEntryRow({ entry }: { entry: ProjectedEntry }) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-card opacity-75">
      <div className="w-0.5 h-7 rounded-full shrink-0 bg-border" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{entry.name}</p>
        <p className="text-xs text-muted-foreground">
          {entry.dueDateDay ? `due ${ordinal(entry.dueDateDay)}` : "projected"}
          {entry.isFixed ? " · fixed" : ""}
        </p>
      </div>
      <span className="text-sm font-semibold text-muted-foreground shrink-0">
        {fmt(entry.amount)}
      </span>
    </div>
  );
}

function FYSummaryCard({ recentMonths, fyIncome, fyExpenses, fyBalance, trendData, fmt }: {
  recentMonths: RecentMonthSummary[];
  fyIncome: number; fyExpenses: number; fyBalance: number;
  trendData: { name: string; Income: number; Expenses: number }[];
  fmt: (v: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="overflow-hidden border-border">
      <div className="h-0.5 bg-primary/60" />
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left"
      >
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium mb-2.5">Last {recentMonths.length} months</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Income</p>
              <p className="text-sm font-bold text-positive tracking-tight">{fmt(fyIncome)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Expenses</p>
              <p className="text-sm font-bold text-negative tracking-tight">{fmt(fyExpenses)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{fyBalance >= 0 ? "In hand" : "Deficit"}</p>
              <p className={cn("text-sm font-bold tracking-tight", fyBalance >= 0 ? "text-positive" : "text-negative")}>
                {fyBalance >= 0 ? "+" : "-"}{fmt(Math.abs(fyBalance))}
              </p>
            </div>
          </div>
        </CardContent>
      </button>
      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-2 space-y-1.5">
          <div className="grid grid-cols-4 gap-1 text-xs text-muted-foreground uppercase tracking-widest font-medium mb-1 px-1">
            <span>Month</span><span className="text-right">Income</span><span className="text-right">Expenses</span><span className="text-right">Net</span>
          </div>
          {trendData.map(m => {
            const net = m.Income - m.Expenses;
            return (
              <div key={m.name} className="grid grid-cols-4 gap-1 text-xs px-1">
                <span className="text-foreground font-medium">{m.name}</span>
                <span className="text-right text-positive tabular-nums tracking-tight">{fmt(m.Income)}</span>
                <span className="text-right text-negative tabular-nums tracking-tight">{fmt(m.Expenses)}</span>
                <span className={cn("text-right font-semibold tabular-nums tracking-tight", net >= 0 ? "text-positive" : "text-negative")}>
                  {net >= 0 ? "+" : "-"}{fmt(Math.abs(net))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function PaidSummaryPanel({ entries, totalCommitted, grandIncome, adHocExpense, adHocItems, fmt }: {
  entries: EntryWithTemplate[];
  totalCommitted: number;
  grandIncome: number;
  adHocExpense: number;
  adHocItems: AdHocItem[];
  fmt: (v: number) => string;
}) {
  const [collapsed, setCollapsed] = useState(true);

  // Include fully paid + partially paid entries (expenses only, not investments)
  const shown = entries.filter(e => e.isPaid || (e.paidAmount != null && e.paidAmount > 0));
  const cashItems = adHocItems.filter(i => i.type === "EXPENSE" && i.category !== "CREDIT_CARD");
  if (!shown.length && cashItems.length === 0) return null;

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

  const totalPaidOut = shown.reduce((s, e) => s + effectivePaid(e), 0);
  const partialEntries = entries.filter(e => !e.isPaid && e.paidAmount != null && e.paidAmount > 0 && e.template.category !== "CREDIT_CARD");
  const partialTotal = partialEntries.reduce((s, e) => s + (e.paidAmount ?? 0), 0);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-positive shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Settlement Summary</p>
            <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
              {fmt(totalPaidOut)} of {fmt(totalCommitted)}
              {partialEntries.length > 0 && (
                <span className="text-warning ml-1.5">· {partialEntries.length} partial</span>
              )}
            </p>
          </div>
        </div>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ml-2", !collapsed && "rotate-180")} />
      </button>

      {!collapsed && (
        <div className="border-t border-border">
          {groups.map(g => {
            const subtotal = g.items.reduce((s, e) => s + effectivePaid(e), 0);
            return (
              <div key={g.key} className="px-4 py-2.5 border-b border-border/50 last:border-b-0">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">{g.label}</span>
                  <span className="text-xs font-semibold tabular-nums">{fmt(subtotal)}</span>
                </div>
                <div className="space-y-1.5 pl-3">
                  {g.items.map(e => {
                    const isPartial = !e.isPaid && e.paidAmount != null && e.paidAmount > 0;
                    const remaining = net(e) - (e.paidAmount ?? 0);
                    return (
                      <div key={e.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs text-muted-foreground truncate">{e.template.name}</span>
                          {isPartial && (
                            <span className="text-xs font-semibold text-warning bg-warning-bg px-1 py-0.5 rounded shrink-0">partial payment</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {e.cashbackAmount ? (
                            <span className="text-xs text-positive">-{fmt(e.cashbackAmount)} cb</span>
                          ) : null}
                          {isPartial && (
                            <span className="text-xs text-muted-foreground">{fmt(remaining)} left</span>
                          )}
                          {!isPartial && e.paidOn && (
                            <span className="text-xs text-muted-foreground/70">{format(new Date(e.paidOn), "do MMM")}</span>
                          )}
                          <span className={cn("text-xs font-semibold tabular-nums", isPartial && "text-warning")}>
                            {fmt(effectivePaid(e))}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {/* Cash / UPI spend this month — total only, items visible in main feed */}
          {cashItems.length > 0 && (
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border/50">
              <IndianRupee className="w-3 h-3 text-warning shrink-0" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">Cash / UPI spend</span>
              <span className="text-xs font-semibold tabular-nums">{fmt(adHocExpense)}</span>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

function TransactionRow({ item, onDelete, onEditRequest, isRemoving }: { item: AdHocItem; onDelete: (id: string) => void; onEditRequest?: (item: AdHocItem) => void; isRemoving?: boolean }) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const isCarryForward = item.notes === "carry_forward";

  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-card transition-all duration-150",
      isCarryForward && "border-warning-border bg-warning-bg/40",
      isRemoving && "opacity-0 scale-95 pointer-events-none"
    )}>
      <div className={cn("w-0.5 h-7 rounded-full shrink-0", item.type === "INCOME" ? "bg-positive" : "bg-negative")} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium">{item.name}</p>
          {isCarryForward && (
            <span className="text-xs font-semibold text-warning bg-warning-bg px-1 py-0.5 rounded">carried fwd</span>
          )}
          {item.customCategory && (
            <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{item.customCategory}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {format(new Date(item.date), "dd MMM")}
          {item.notes && !isCarryForward ? ` · ${item.notes}` : ""}
        </p>
      </div>
      <span className={cn("text-sm font-semibold shrink-0", item.type === "INCOME" ? "text-positive" : "text-negative")}>
        {item.type === "INCOME" ? "+" : "-"}{fmt(item.amount)}
      </span>
      {onEditRequest && !isCarryForward && (
        <Button variant="ghost" size="sm" onClick={() => onEditRequest(item)} className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground shrink-0">
          <Pencil className="w-4 h-4" />
        </Button>
      )}
      <Button variant="ghost" size="sm" disabled={isRemoving} onClick={() => onDelete(item.id)} className="h-10 w-10 p-0 text-muted-foreground hover:text-negative shrink-0">
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
