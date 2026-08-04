"use client";

import { useState, useMemo, useEffect, useRef, useTransition, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { formatCurrency, formatMonthYear, getCategoryDisplay, getCategoryColor, getCategoryIcon, MONTHS, pendingAmountKicks, ordinal, EXPENSE_CATEGORIES } from "@/lib/utils";
import { netAmount as _net, effectivePaid as _effectivePaid, isBillPending as _isBillPending, isPreCloseDate, isPastDueDate, isDueDateNextMonth, mostRecentCloseDate, computeMetrics, computeMonthIncome, computeCashBalance } from "@/lib/finance-utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Pencil, ChevronDown, Trash2, ChevronLeft, ChevronRight, Check, Calendar, Loader2, RotateCcw, ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import { EntryRow } from "./entry-row";
import { DailySpendsSection } from "./daily-spends-section";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryCard } from "@/components/ui/summary-card";
import { PageHeader } from "@/components/ui/page-header";
import { TabsUnderline } from "@/components/ui/tabs-underline";
import { CategoryBadge } from "@/components/ui/category-badge";
import { PaymentDialog } from "./payment-dialog";
import { CardStatementDialog, type CardTransaction } from "./card-statement-dialog";
import { usePaymentTick } from "@/hooks/use-payment-tick";
import { DashboardTour } from "@/components/coach/dashboard-tour";
import { GmailReconnectBanner, type GmailStatus } from "./gmail-reconnect-banner";
import type { CCCard, AdHocSubmitFields } from "./adhoc-dialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const DashboardCharts = dynamic(
  () => import("./dashboard-charts").then(m => m.DashboardCharts),
  { ssr: false, loading: () => <div className="h-64 rounded-xl bg-muted animate-pulse" /> }
);

const DailySpendChart = dynamic(
  () => import("./daily-spend-chart").then(m => m.DailySpendChart),
  { ssr: false, loading: () => <div className="h-48 rounded-xl bg-muted animate-pulse" /> }
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

// An unpaid bill still sitting in an earlier month — surfaced here so it can
// be paid directly against its real original entry (in its real original
// month) instead of ever being copied into the current one.
type CarriedOverEntry = {
  id: string; monthId: string; amount: number; cashbackAmount: number | null; paidAmount: number | null;
  template: { name: string; category: string; customCategory: string | null; dueDateDay: number | null; statementDay: number | null };
  month: { month: number; year: number };
};

// A real payment event that settled part or all of an earlier month's own
// bill during the month being viewed — `amount` here is exactly what moved
// in THIS event, not the bill's whole original amount (see
// CarriedDebtSettlement). Shown in Payables alongside this month's own
// bills instead of just vanishing from Pending.
type SettledCarryOverEntry = {
  id: string; amount: number; billMonth: number; billYear: number;
  template: { name: string };
};

interface DashboardClientProps {
  currentMonth: MonthWithDetails | null;
  recentMonths: RecentMonthSummary[];
  ccTemplates: { id: string; name: string; statementDay: number | null; dueDateDay: number | null }[];
  customCategories: { id: string; name: string }[];
  subCategorySuggestions: { category: string | null; customCategoryId: string | null; subCategory: string | null }[];
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
  gmailStatus?: GmailStatus;
  carriedOverEntries?: CarriedOverEntry[];
  settledCarryOverEntries?: SettledCarryOverEntry[];
}

type MonthWithDetails = {
  id: string; month: number; year: number;
  salaryIncome: number; freelanceIncome: number; otherIncome: number;
  openingBalance: number;
  carriedDebtPaid: number;
  isPopulated: boolean;
  entries: EntryWithTemplate[];
  adHocItems: AdHocItem[];
};

type RecentMonthSummary = {
  id: string; month: number; year: number;
  salaryIncome: number; freelanceIncome: number; otherIncome: number;
  openingBalance: number;
  entries: { id: string; templateId: string; amount: number; cashbackAmount: number | null }[];
  adHocItems: { id: string; name: string; type: string; amount: number; category: string | null; customCategory: string | null; customCategoryId: string | null; subCategory: string | null; notes: string | null; ccTemplateId: string | null; isCredit?: boolean; date: string }[];
};

type EntryWithTemplate = {
  id: string; amount: number; isPaid: boolean; paidOn: string | null; paidAmount: number | null; cashbackAmount: number | null; notes: string | null; templateId: string;
  statementAmount: number | null; billedAmount: number | null; carriedInAmount?: number | null;
  paidViaCardTemplateId?: string | null; billPaymentsAttributed?: number | null;
  template: { id: string; name: string; category: string; customCategory: string | null; isFixed: boolean; dueDateDay: number | null; statementDay: number | null; creditLimit?: number | null; loanInterestRate: number | null; loanRateType: string | null; loanOriginalPrincipal: number | null; loanStartDate: string | null; loanOutstandingOverride: number | null };
};

type AdHocItem = {
  id: string; name: string; amount: number; type: string; category: string | null; customCategory: string | null; customCategoryId: string | null; subCategory: string | null; date: string; notes: string | null; ccTemplateId: string | null; isCredit?: boolean;
};


// Every consumer below skips CREDIT_CARD immediately (it has its own
// Pending Card Payments section), so its position in this list never
// actually matters — safe to reuse the shared EXPENSE_CATEGORIES export
// instead of maintaining a second, independently-ordered copy.
const CATEGORY_ORDER = EXPENSE_CATEGORIES;

const INCOME_SOURCES = [
  { value: "bonus",     label: "Bonus",     dbCategory: "OTHER_INCOME" },
  { value: "freelance", label: "Freelance", dbCategory: "FREELANCE" },
  { value: "refund",    label: "Refund",    dbCategory: "OTHER_INCOME" },
  { value: "other",     label: "Other",     dbCategory: "OTHER_INCOME" },
];

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

// Bill/dues view only — the individual purchases that built this bill live
// in Daily/Regular Spends instead, so this card no longer needs a nested
// transaction list, only whether next cycle already has spend against it
// (hasPostCloseSpend) to guard the "Clear" action.
function CCCardBlock({
  entry, hasPostCloseSpend, nextMonthName, isBillPending, onUpdate, onClearStatement, collapsed, onToggle, transactions,
}: {
  entry: EntryWithTemplate;
  hasPostCloseSpend: boolean;
  nextMonthName: string;
  isBillPending: boolean;
  onUpdate: (id: string, updates: { isPaid?: boolean; amount?: number; notes?: string; paidAmount?: number; cashbackAmount?: number; payCarriedAmount?: number }) => Promise<void>;
  onClearStatement: (entryId: string) => Promise<void>;
  collapsed: boolean;
  onToggle: () => void;
  transactions: CardTransaction[];
}) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const [showStatement, setShowStatement] = useState(false);
  const [payingCarried, setPayingCarried] = useState(false);
  const statementDay = entry.template.statementDay;
  const nextBillTotal = entry.statementAmount ?? 0;
  // The currently-accumulating cycle's real start date, not "next month" —
  // for a card that generates early in the month (e.g. the 1st), spend
  // building toward that bill is mostly dated THIS month, not next.
  const cycleStartLabel = statementDay != null
    ? `${ordinal(mostRecentCloseDate(statementDay).getDate())} ${format(mostRecentCloseDate(statementDay), "MMM")} – ongoing`
    : null;
  const billedTotal = entry.billedAmount ?? entry.amount;
  const creditLimit = entry.template.creditLimit ?? null;
  const utilPct = creditLimit ? Math.round((billedTotal / creditLimit) * 100) : null;
  const isDueNextMonth = isDueDateNextMonth(statementDay, entry.template.dueDateDay);
  const ccColor = getCategoryColor(entry.template.category, entry.template.customCategory);
  const ccIcon  = getCategoryIcon(entry.template.category, entry.template.customCategory);
  // Single shared tick instance — used by both the collapsed header's tick
  // and the expanded EntryRow's tick, so they never fall out of sync.
  const tick = usePaymentTick(entry, onUpdate);

  // While the statement hasn't closed yet, `amount` is a blend of real
  // already-owed debt (carriedInAmount) and new spend still accumulating
  // toward this cycle's own bill (not owed yet). Showing the blended total
  // as "the bill" makes it look like more is due than actually is —
  // headline shows just what's really owed, the rest shows separately.
  const carriedInAmount = Math.max(0, entry.carriedInAmount ?? 0);
  const buildingThisCycle = isBillPending ? Math.max(0, entry.amount - carriedInAmount) : 0;

  // One secondary status at a time instead of stacking multiple colored
  // hints — partial payment (informational) takes priority over a due
  // date (urgent, the only thing that earns the warning color) over a
  // "building for next month" hint (informational, collapsed-only so it
  // doesn't repeat the expanded breakdown below).
  const rightStatus = tick.isPartial
    ? { text: `${fmt(tick.paidAmount!)} paid so far`, warn: false }
    : isBillPending && buildingThisCycle > 0
      ? { text: `+${fmt(buildingThisCycle)} current outstanding`, warn: false }
      : entry.template.dueDateDay && !tick.isPaid
        ? { text: `due ${ordinal(entry.template.dueDateDay)}${isDueNextMonth ? ` ${nextMonthName}` : ""}`, warn: true }
        : collapsed && nextBillTotal > 0
          ? { text: `+${fmt(nextBillTotal)} for ${nextMonthName}`, warn: false }
          : null;

  // The expanded section only ever renders the "billed vs paying" rollover
  // note, the still-accumulating-this-cycle breakdown, or the next-cycle
  // bill total — if none apply there's nothing to reveal, so the
  // chevron/expand affordance would be a dead control that visibly does
  // nothing on tap. Render a plain, non-interactive header in that case
  // instead of a collapsible one.
  const hasExpandableContent = (entry.billedAmount != null && entry.billedAmount > entry.amount)
    || nextBillTotal > 0
    || (isBillPending && buildingThisCycle > 0)
    || utilPct != null;

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-colors",
      tick.isPaid ? "border-border/60 bg-muted/20" : "border-border bg-card"
    )}>
      {/* Card header — click to expand/collapse the whole card, only when
          there's something below to reveal (see hasExpandableContent).
          A plain div (not a button) since it hosts the nested tick button below.
          Split across two lines so name/badge and amount/due-date each get
          their own row instead of competing for space on one crowded line. */}
      <div
        role={hasExpandableContent ? "button" : undefined}
        tabIndex={hasExpandableContent ? 0 : undefined}
        onClick={hasExpandableContent ? onToggle : undefined}
        onKeyDown={hasExpandableContent ? (e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }) : undefined}
        className={cn(
          "w-full px-3 py-2.5 bg-muted/30 transition-colors",
          hasExpandableContent && "hover:bg-muted/50 cursor-pointer",
          hasExpandableContent && !collapsed && "border-b border-border"
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
          <CategoryBadge icon={ccIcon} color={ccColor} size="sm" />
          <span className={cn("text-sm font-semibold truncate flex-1 min-w-0 text-left", tick.isPaid && "text-muted-foreground")}>{entry.template.name}</span>
          {transactions.length > 0 && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setShowStatement(true); }}
              title="View statement"
              className="shrink-0 flex items-center justify-center w-7 h-7 -mx-1 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <ScrollText className="w-3.5 h-3.5" />
            </button>
          )}
          <span className={cn("text-sm font-semibold tabular-nums shrink-0", tick.isPaid && "text-muted-foreground line-through")}>
            {tick.isPartial ? fmt(tick.outstanding) : tick.cashback > 0 && !tick.isPaid ? fmt(tick.netBill) : isBillPending ? fmt(carriedInAmount) : fmt(billedTotal)}
          </span>
          {hasExpandableContent && (
            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200 shrink-0", !collapsed && "rotate-180")} />
          )}
        </div>

        {/* Secondary line — one status at a time (see rightStatus above),
            not several colored hints competing for attention. */}
        {(statementDay || rightStatus) && (
          <div className="flex items-center justify-between mt-1 pl-11">
            <span className="text-xs text-muted-foreground">
              {statementDay ? `generates ${ordinal(statementDay)}` : ""}
            </span>
            {rightStatus && (
              <span className={cn("text-xs", rightStatus.warn ? "text-warning" : "text-muted-foreground")}>
                {rightStatus.text}
              </span>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Utilization — only when a Credit Limit is set on this card (Vault). */}
          {utilPct != null && (
            <div className="px-3 py-2 border-b border-border space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Utilization</span>
                <span className="font-medium">{fmt(billedTotal)} / {fmt(creditLimit!)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    utilPct >= 90 ? "bg-negative" : utilPct >= 70 ? "bg-warning" : "bg-primary"
                  )}
                  style={{ width: `${Math.min(100, utilPct)}%` }}
                />
              </div>
            </div>
          )}

          {/* Billed vs paying indicator — only when they differ */}
          {entry.billedAmount != null && entry.billedAmount > entry.amount && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border">
              <span className="text-xs text-warning">
                Statement <span className="font-semibold">{fmt(entry.billedAmount)}</span>
                {" · "}Rolling <span className="font-semibold">{fmt(entry.billedAmount - entry.amount)}</span> to next month
              </span>
            </div>
          )}

          {/* Owed now vs still building — only while the statement hasn't
              closed and there's real carried debt to separate from new
              spend (see carriedInAmount/buildingThisCycle above). */}
          {isBillPending && carriedInAmount > 0 && buildingThisCycle > 0 && (
            <div className="px-3 py-2 border-b border-border space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Overdue amount (last month)</span>
                <span className="font-semibold">{fmt(carriedInAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Current outstanding</span>
                <span className="font-semibold text-muted-foreground">{fmt(buildingThisCycle)}</span>
              </div>
              {/* Real debt shouldn't have to wait for this cycle's own
                  statement to close before it can be paid off. */}
              <button
                disabled={payingCarried}
                onClick={async () => {
                  setPayingCarried(true);
                  await onUpdate(entry.id, { payCarriedAmount: carriedInAmount });
                  setPayingCarried(false);
                }}
                className="w-full mt-1 text-xs font-medium text-primary border border-primary/30 bg-primary/5 px-2.5 py-1.5 rounded-md hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {payingCarried ? "Paying…" : `Pay ${fmt(carriedInAmount)} overdue amount`}
              </button>
            </div>
          )}

          {/* Spend building toward a bill that hasn't generated yet —
              "building" makes clear this is spend already made that hasn't
              turned into its own bill yet, not an action or a due date.
              Two different cards land here for two different reasons: a
              card whose statement already closed this month is building
              toward NEXT month's bill (nextBillTotal, from statementAmount);
              a still-open card with nothing carried in from before (so
              block above doesn't apply) is building toward THIS month's own
              not-yet-generated bill (buildingThisCycle, from amount) — same
              label, different source field, never both at once. */}
          {(nextBillTotal > 0 || (isBillPending && carriedInAmount <= 0 && buildingThisCycle > 0)) && (
            <div className="border-t border-border px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {cycleStartLabel}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tracking-tight">{fmt(nextBillTotal > 0 ? nextBillTotal : buildingThisCycle)}</span>
                  {nextBillTotal > 0 && !hasPostCloseSpend && (
                    <button
                      onClick={() => onClearStatement(entry.id)}
                      className="text-xs font-medium text-muted-foreground border border-border bg-card px-2.5 py-1 rounded-md hover:border-foreground/30 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <CardStatementDialog
        open={showStatement}
        onOpenChange={setShowStatement}
        cardName={entry.template.name}
        statementDay={statementDay}
        transactions={transactions}
        hasOutstandingBill={!isBillPending || carriedInAmount > 0}
      />

      {/* Owned here (not by EntryRow) so it works from the collapsed tick too */}
      <PaymentDialog tick={tick} entryName={entry.template.name} amount={entry.amount} fmt={fmt} />
    </div>
  );
}

export function DashboardClient({ currentMonth: initialMonth, recentMonths: initialRecentMonths, ccTemplates, customCategories, subCategorySuggestions, incomeTemplates, todayMonth, todayYear, targetMonth, targetYear, prevUrl, nextUrl, projectedIncome, projectedEntries, gmailStatus = "ok", carriedOverEntries: initialCarriedOver = [], settledCarryOverEntries = [] }: DashboardClientProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const viewMonth = targetMonth ?? todayMonth;
  const viewYear  = targetYear  ?? todayYear;
  const isProjected = projectedEntries != null;
  // Memoized for the same reason entries/adHocItems are below — avoids a
  // fresh [] reference (and cascading useMemo recomputation) on every
  // render when projectedEntries is undefined.
  const projEntries = useMemo(() => projectedEntries ?? [], [projectedEntries]);
  const isCurrentMonth = viewMonth === todayMonth && viewYear === todayYear;
  const todayDay = new Date().getDate();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(url: string) {
    startTransition(() => router.push(url));
  }
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [carriedOver, setCarriedOver] = useState(initialCarriedOver);
  const [recentMonths, setRecentMonths] = useState(initialRecentMonths);
  // A custom category / sub-category created inline while adding or editing
  // a spend needs to show up as a chip immediately for the *next* add/edit
  // in this session, not just after a full page reload — merged in below
  // whenever handleAdHocAdd/handleAdHocEdit's response introduces one that
  // isn't in the server-provided list yet.
  const [localCustomCategories, setLocalCustomCategories] = useState(customCategories);
  const [localSubCategorySuggestions, setLocalSubCategorySuggestions] = useState(subCategorySuggestions);
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [editingItem, setEditingItem] = useState<AdHocItem | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [showSetup, setShowSetup] = useState(!initialMonth && !isProjected);
  const [showIncomeEdit, setShowIncomeEdit] = useState(false);
  const [showPendingDrilldown, setShowPendingDrilldown] = useState(false);
  const [showCCBillDrilldown, setShowCCBillDrilldown] = useState(false);
  const [showExpenditureDrilldown, setShowExpenditureDrilldown] = useState(false);
  const [showCashDrilldown, setShowCashDrilldown] = useState(false);
  // Payables (recurring bills + card dues, both action-oriented) vs Daily
  // Spend (browsing/logging ad-hoc transactions) — splitting these into
  // tabs instead of stacking every section on one long page.
  const [tab, setTab] = useState<"payables" | "spends">("spends");

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
    setLocalCustomCategories(customCategories);
    setLocalSubCategorySuggestions(subCategorySuggestions);
  }

  // Adds a newly-created custom category / sub-category (from an add or
  // edit response) to the local suggestion lists if not already present.
  function mergeNewCategory(item: { category: string | null; customCategory: string | null; customCategoryId: string | null; subCategory: string | null }) {
    if (item.customCategoryId && item.customCategory) {
      setLocalCustomCategories(prev => prev.some(c => c.id === item.customCategoryId)
        ? prev
        : [...prev, { id: item.customCategoryId!, name: item.customCategory! }]);
    }
    if (item.subCategory) {
      setLocalSubCategorySuggestions(prev => prev.some(s =>
        s.category === item.category && s.customCategoryId === item.customCategoryId && s.subCategory === item.subCategory
      ) ? prev : [...prev, { category: item.category, customCategoryId: item.customCategoryId, subCategory: item.subCategory }]);
    }
  }

  // Memoized so a null currentMonth (the projected-future-month view)
  // doesn't create a fresh [] reference every render — that was making
  // every downstream useMemo depending on entries/adHocItems see a
  // "changed" dependency and recompute on every render instead of only
  // when the underlying data actually changed.
  const entries = useMemo(() => currentMonth?.entries ?? [], [currentMonth]);
  const adHocItems = useMemo(() => currentMonth?.adHocItems ?? [], [currentMonth]);

  // A card's statement popup needs every charge that could still belong to
  // its currently-outstanding bill or its accumulating one — for a card
  // whose Bill Generation Date falls early in the month (e.g. the 1st),
  // that bill's own charges are almost entirely dated in the PREVIOUS
  // calendar month, not this one. recentMonths already carries adHocItems
  // for the last 6 months; merge those with this month's live state
  // (which wins on id collision, since it reflects any just-made edit
  // recentMonths' cached snapshot wouldn't yet have) instead of only ever
  // looking at the single month currently being viewed.
  const ccTransactionsByCard = useMemo(() => {
    const byId = new Map<string, AdHocItem>();
    for (const m of recentMonths) {
      for (const item of m.adHocItems) {
        if (item.type === "EXPENSE" && item.ccTemplateId) byId.set(item.id, item);
      }
    }
    for (const item of adHocItems) {
      if (item.type === "EXPENSE" && item.ccTemplateId) byId.set(item.id, item);
    }
    const byCard = new Map<string, AdHocItem[]>();
    for (const item of byId.values()) {
      const list = byCard.get(item.ccTemplateId!) ?? [];
      list.push(item);
      byCard.set(item.ccTemplateId!, list);
    }
    return byCard;
  }, [recentMonths, adHocItems]);

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
  const adHocExpense  = useMemo(() => adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0), [adHocItems]);
  // With no income template to derive a live figure from, fall back to the
  // manually-entered salaryIncome instead of letting it silently read as 0.
  const grandIncome   = (incomeTemplates.length === 0 ? (currentMonth?.salaryIncome ?? 0) : templateIncome) + adHocIncome;

  // Single-pass metric computation via shared finance-utils
  const metrics = useMemo(
    () => computeMetrics(entries, isCurrentMonth, todayDay),
    [entries, isCurrentMonth, todayDay],
  );
  const {
    totalCommitted, totalPaid, totalPending, paidPercent, pendingCount,
    ccBillsThisMonth, recurringNonCC, ccNextMonth, cashCommitted, cashPaid,
  } = metrics;

  const openingBalance = currentMonth?.openingBalance ?? 0;
  // Real cash paid this month toward a bill from an earlier month — kept
  // separate from openingBalance (a frozen "what I started the month with"
  // snapshot) so that snapshot never gets silently overwritten by a later
  // payment. Still has to reduce the actual cash totals below.
  const carriedDebtPaid = currentMonth?.carriedDebtPaid ?? 0;
  // cashCommitted/cashPaid (not totalCommitted/totalPaid) — a bill settled
  // via a card is fully "committed"/"paid" for Expenditure/Pending purposes,
  // but no actual cash moves for it until that card's own bill gets paid off.
  const balance   = computeCashBalance({ openingBalance, income: grandIncome, expense: cashCommitted + adHocExpense, carriedDebtPaid });
  const inHandNow = computeCashBalance({ openingBalance, income: grandIncome, expense: cashPaid + adHocExpense, carriedDebtPaid });

  // Still-unpaid bills from earlier months are real pending money — they
  // belong in the headline Pending total, not just tucked away in their own
  // Payables section where they'd look like they don't count.
  const carriedOverPending = useMemo(
    // carriedOver is always isPaid: false at the source query, so the raw
    // `- paidAmount` here is equivalent to effectivePaid but doesn't need
    // CarriedOverEntry to carry an isPaid field it otherwise has no use for.
    () => carriedOver.reduce((s, e) => s + (_net(e) - (e.paidAmount ?? 0)), 0),
    [carriedOver]
  );
  const totalPendingWithCarryOver = totalPending + carriedOverPending;

  // Old debt actually paid off during the month being viewed — real cash
  // out this cycle, even though the bill itself belongs to an earlier
  // month. Belongs in Payables alongside this month's own bills.
  const settledCarryOverTotal = useMemo(
    () => settledCarryOverEntries.reduce((s, e) => s + e.amount, 0),
    [settledCarryOverEntries]
  );

  const nextMonthName  = MONTHS[todayMonth % 12]; // todayMonth is 1-12; % 12 maps Dec→Jan correctly

  type GroupedItem =
    | { kind: "entry"; data: EntryWithTemplate }
    | { kind: "projected"; data: ProjectedEntry };

  // Recurring Payments: bill templates only, grouped by category — credit
  // card bills excluded (their own Pending Card Payments section) and
  // ad-hoc transactions excluded (their own Daily/Regular Spends section,
  // regardless of payment method) rather than merged in here.
  const { grouped, ccEntries } = useMemo(() => {
    if (isProjected) {
      const result: Record<string, GroupedItem[]> = {};
      for (const cat of CATEGORY_ORDER) {
        if (cat === "CREDIT_CARD") continue;
        const items = projEntries.filter(e => !e.customCategory && e.category === cat);
        if (items.length) result[cat] = items.map(d => ({ kind: "projected" as const, data: d }));
      }
      for (const e of projEntries) {
        if (e.customCategory) {
          if (!result[e.customCategory]) result[e.customCategory] = [];
          result[e.customCategory].push({ kind: "projected" as const, data: e });
        }
      }
      const ccProjected = projEntries.filter(e => e.category === "CREDIT_CARD").map(d => ({ kind: "projected" as const, data: d }));
      return { grouped: result, ccEntries: ccProjected };
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
      if (cat === "CREDIT_CARD") continue;
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

    // Sink fully-settled categories (all entries paid) below groups that
    // still need action. CATEGORY_ORDER / insertion order is preserved as
    // a stable tiebreak within each bucket.
    const isSettled = (items: GroupedItem[]) => {
      const entryItems = items.filter((i): i is { kind: "entry"; data: EntryWithTemplate } => i.kind === "entry");
      return entryItems.length > 0 && entryItems.every(i => i.data.isPaid);
    };
    const ordered: Record<string, GroupedItem[]> = {};
    for (const key of Object.keys(result).sort((a, b) => Number(isSettled(result[a])) - Number(isSettled(result[b])))) {
      ordered[key] = result[key];
    }

    const ccEntries = entries.filter(e => e.template.category === "CREDIT_CARD").sort(sortEntries).map(d => ({ kind: "entry" as const, data: d }));

    return { grouped: ordered, ccEntries };
  }, [entries, isProjected, projEntries]);

  // Drilldown breakdowns — same figures the top-line tiles already sum,
  // just itemized so a click answers "where did this number come from"
  // instead of having to trust it.
  // This month's own recurring pending (non-CC) — a single total for the
  // drilldown summary line, since every one of these is already itemized
  // in the Payables tab's Recurring Payments list, no need to repeat it here.
  const recurringPendingTotal = useMemo(() => {
    return entries
      .filter(e => e.template.category !== "CREDIT_CARD" && !e.isPaid)
      .reduce((s, e) => s + (_net(e) - _effectivePaid(e)), 0);
  }, [entries]);

  const ccBillBreakdown = useMemo(() => {
    return ccEntries
      .filter((i): i is { kind: "entry"; data: EntryWithTemplate } => i.kind === "entry")
      .map(({ data: e }) => {
        const pending = _isBillPending(e, isCurrentMonth, todayDay);
        const amount = pending ? Math.max(0, (e.carriedInAmount ?? 0) - (e.cashbackAmount ?? 0)) : _net(e);
        // `amount` above is the full committed bill — right for Expenditure/CC
        // Bill (spend happened regardless of payment). Pending needs what's
        // actually still owed, which is 0 once the entry is paid — otherwise
        // a settled bill keeps showing its full original amount there forever.
        const outstanding = pending ? amount : Math.max(0, _net(e) - _effectivePaid(e));
        return { id: e.id, name: e.template.name, amount, pending, outstanding, isPaid: e.isPaid, isPartial: !e.isPaid && _effectivePaid(e) > 0 };
      })
      .filter(c => c.amount > 0);
  }, [ccEntries, isCurrentMonth, todayDay]);

  const { fyIncome, fyExpenses, fyBalance, trendData } = useMemo(() => {
    const ccStatementDayById = new Map(ccTemplates.map(t => [t.id, t.statementDay]));
    const monthIncome = (m: typeof recentMonths[0]) =>
      computeMonthIncome(m.adHocItems, incomeTemplates, m.month, m.year, m.salaryIncome);
    const monthExpenses = (m: typeof recentMonths[0]) => {
      const isCurrent = m.month === todayMonth && m.year === todayYear;
      return m.entries.reduce((a, e) => {
        const stDay = ccStatementDayById.get(e.templateId);
        if (stDay !== undefined && _isBillPending({ template: { category: "CREDIT_CARD", statementDay: stDay } }, isCurrent, todayDay)) return a;
        return a + _net(e);
      }, 0)
      + m.adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((a, i) => a + i.amount, 0);
    };

    const fyIncome   = recentMonths.reduce((s, m) => s + monthIncome(m), 0);
    const fyExpenses = recentMonths.reduce((s, m) => s + monthExpenses(m), 0);
    const trendData  = [...recentMonths].reverse().map(m => ({
      name: format(new Date(m.year, m.month - 1), "MMM"),
      Income: monthIncome(m),
      Expenses: monthExpenses(m),
    }));
    // recentMonths is ordered most-recent-first — the oldest month's
    // openingBalance is this window's real starting cash position, so
    // chaining forward from it (instead of a bare income-minus-expenses)
    // keeps this "In hand"/"Deficit" figure consistent with the tiles
    // above, which already account for carried-forward balance.
    const oldestMonth = recentMonths[recentMonths.length - 1];
    const fyBalance = (oldestMonth?.openingBalance ?? 0) + fyIncome - fyExpenses;
    return { fyIncome, fyExpenses, fyBalance, trendData };
  }, [recentMonths, incomeTemplates, ccTemplates, todayMonth, todayYear, todayDay]);

  const { prevMonthName, expensesDelta } = useMemo(() => {
    const prev = [...recentMonths]
      .filter(m => !(m.month === currentMonth?.month && m.year === currentMonth?.year))
      .sort((a, b) => b.year - a.year || b.month - a.month)[0];
    if (!prev) return { prevMonthName: null, expensesDelta: null };
    const prevExp = prev.entries
      .reduce((s, e) => s + _net(e), 0)
      + prev.adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0);
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
  const dispPaidPct         = isProjected ? 0 : paidPercent;
  const dispPending         = isProjected ? dispCommitted : totalPending;
  const dispFixed           = isProjected ? projEntries.filter(e => e.isFixed).reduce((s, e) => s + e.amount, 0) : fixedAmount;
  const dispVariable        = isProjected ? (dispCommitted - dispFixed) : variableAmount;
  const dispSavings         = dispIncome > 0 ? Math.round(((dispIncome - dispCommitted - dispAdHoc) / dispIncome) * 100) : 0;
  const dispRecurringNonCC  = isProjected ? projEntries.filter(e => e.category !== "CREDIT_CARD").reduce((s, e) => s + e.amount, 0) : recurringNonCC;
  const dispCCBills         = isProjected ? projEntries.filter(e => e.category === "CREDIT_CARD").reduce((s, e) => s + e.amount, 0) : ccBillsThisMonth;

  // Nearest unpaid items across both recurring bills and CC dues — a
  // single glanceable "what needs action" row instead of only surfacing
  // urgency after expanding every category accordion. CC bills that
  // haven't closed yet (isBillPending) aren't really "due" so they're
  // excluded, same as the category-total calculation above does.
  const upcomingPayments = useMemo(() => {
    const isCurrentMonth = currentMonth?.month === todayMonth && currentMonth?.year === todayYear;
    if (!isCurrentMonth) return [];
    const today = new Date().getDate();
    // Payment Due Date can wrap into next month relative to this entry's
    // own month (Bill Generation Date > Payment Due Date) — see
    // isPastDueDate in finance-utils.ts.
    return entries
      .filter(e => !e.isPaid && e.template.dueDateDay != null && !isBillPending(e, isCurrentMonth, today))
      .map(e => ({
        id: e.id,
        name: e.template.name,
        amount: net(e) - _effectivePaid(e),
        dueDay: e.template.dueDateDay!,
        overdue: isPastDueDate(todayMonth, todayYear, e.template.statementDay, e.template.dueDateDay!, todayMonth, todayYear, today),
        category: e.template.category,
        customCategory: e.template.customCategory,
      }))
      .sort((a, b) => a.dueDay - b.dueDay)
      .slice(0, 6);
  }, [entries, currentMonth, todayMonth, todayYear]);

  // Collapsible groups: track user overrides; default = always collapsed
  const [groupToggled, setGroupToggled] = useState<Record<string, boolean>>({});
  function isGroupCollapsed(key: string): boolean {
    if (key in groupToggled) return groupToggled[key];
    return true;
  }
  function toggleGroup(key: string) {
    setGroupToggled(prev => ({ ...prev, [key]: !isGroupCollapsed(key) }));
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

  async function handleEntryUpdate(entryId: string, updates: { isPaid?: boolean; amount?: number; notes?: string; paidAmount?: number; cashbackAmount?: number; payCarriedAmount?: number; paidViaCardTemplateId?: string | null }) {
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
        ...(updates.payCarriedAmount !== undefined && { carriedDebtPaid: prev.carriedDebtPaid + updates.payCarriedAmount }),
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
    if (updates.payCarriedAmount !== undefined) toast.success(`${formatCurrency(updates.payCarriedAmount)} paid toward last cycle's balance`);
  }

  // Paying an old bill from a previous month, right now: PATCHes against its
  // real original monthId (not the currently-viewed month — that entry was
  // never copied here), and moves cash out of today's balance immediately
  // rather than backdating it, since the payment is genuinely happening now.
  // The server does the authoritative carriedDebtPaid increment in the same
  // transaction; the effectivePaid delta below just mirrors that locally so
  // the tile updates without waiting on a refetch.
  async function handleCarriedOverUpdate(item: CarriedOverEntry, updates: { isPaid?: boolean; paidAmount?: number; cashbackAmount?: number; paidViaCardTemplateId?: string | null }) {
    const res = await fetch(`/api/months/${item.monthId}/entries`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: item.id, ...updates }),
    });
    if (!res.ok) { toast.error("Failed to save"); return; }
    const updated = await res.json();

    const entryBase = (paidAmount: number | null, isPaid: boolean) => ({
      amount: item.amount, isPaid, paidAmount,
      cashbackAmount: item.cashbackAmount, statementAmount: null, billedAmount: null,
      template: { category: item.template.category, statementDay: item.template.statementDay },
    });
    const paidBefore = _effectivePaid(entryBase(item.paidAmount, false));
    const paidAfter = _effectivePaid(entryBase(updated.paidAmount, updated.isPaid));
    // Paid via a card — no cash moved, so carriedDebtPaid shouldn't reflect
    // it (matches the server, which skips the same bump for the same reason).
    const delta = updates.paidViaCardTemplateId ? 0 : paidAfter - paidBefore;

    setCurrentMonth(prev => prev ? { ...prev, carriedDebtPaid: prev.carriedDebtPaid + delta } : prev);
    setCarriedOver(prev => updated.isPaid
      ? prev.filter(e => e.id !== item.id)
      : prev.map(e => e.id === item.id ? { ...e, paidAmount: updated.paidAmount } : e));

    if (updates.isPaid !== undefined) toast.success(updates.isPaid ? "Marked paid ✓" : "Marked pending");
    if (updates.paidAmount !== undefined && !updated.isPaid) toast.success("Partial payment recorded");
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
    mergeNewCategory(newItem);
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
        ? { ...m, adHocItems: [{ id: newItem.id, name: newItem.name, type: newItem.type, amount: newItem.amount, category: newItem.category, customCategory: newItem.customCategory ?? null, customCategoryId: newItem.customCategoryId ?? null, subCategory: newItem.subCategory ?? null, notes: newItem.notes ?? null, ccTemplateId: newItem.ccTemplateId ?? null, date: newItem.date }, ...m.adHocItems] }
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
    mergeNewCategory(updated);
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
        ? { ...m, adHocItems: m.adHocItems.map(i => i.id === id ? { ...i, type: updated.type, amount: updated.amount, category: updated.category, customCategory: updated.customCategory ?? null, customCategoryId: updated.customCategoryId ?? null, subCategory: updated.subCategory ?? null, notes: updated.notes ?? null, ccTemplateId: updated.ccTemplateId ?? null } : i) }
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
        openingBalance: fullMonth.openingBalance,
        entries: (fullMonth.entries ?? []).map((e: EntryWithTemplate) => ({ id: e.id, templateId: e.templateId, amount: e.amount, cashbackAmount: e.cashbackAmount })),
        adHocItems: (fullMonth.adHocItems ?? []).map((i: AdHocItem) => ({ id: i.id, type: i.type, amount: i.amount, category: i.category })),
      }, ...prev].slice(0, 6);
    });
    toast.success("Month ready");
  }

  // When a recurring income template exists, its live amount is what the
  // dashboard will show regardless of what anyone types — so asking for a
  // manual number at month-start is pure theater. Skip the prompt and start
  // the month silently with the template total instead. Only the
  // zero-income-template case still needs a real manual entry (see
  // SetupMonthDialog below), since there's nothing to derive it from.
  const autoSetupTriggered = useRef(false);
  useEffect(() => {
    if (currentMonth || isProjected || incomeTemplates.length === 0) return;
    if (autoSetupTriggered.current) return;
    autoSetupTriggered.current = true;
    handleSetupMonth(templateIncome);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth, isProjected, incomeTemplates.length]);

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
        {incomeTemplates.length > 0 ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Setting up {formatMonthYear(viewMonth, viewYear)}...</p>
          </div>
        ) : (
          <>
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
            <SetupMonthDialog open={showSetup} onOpenChange={setShowSetup} month={viewMonth} year={viewYear} onConfirm={handleSetupMonth} />
          </>
        )}
      </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DashboardTour />
      <PageHeader title="Dashboard" subtitle="This month's income, expenses, and bills" className="!mb-4" />
      <GmailReconnectBanner status={gmailStatus} />
      {/* Header */}
      <div className="space-y-2 mb-7">
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
            label: "Payables",
            value: fmt(dispCommitted + dispAdHoc + (isProjected ? 0 : settledCarryOverTotal)),
            onClick: isProjected ? undefined : () => setShowExpenditureDrilldown(true),
            hint: <span className="text-xs text-muted-foreground">{fmt(dispRecurringNonCC)} recurring</span>,
          },
          ...(hasCCCards ? [{
            label: "CC Bill",
            value: dispCCBills > 0 ? fmt(dispCCBills) : "-",
            onClick: isProjected || dispCCBills <= 0 ? undefined : () => setShowCCBillDrilldown(true),
            hint: <span className="text-xs text-muted-foreground">{isProjected ? "last month's bill" : dispCCBills > 0 ? "from last month" : "no CC bills"}</span>,
          }] : []),
          ...(hasCCCards && !isProjected ? [{
            label: "CC Next Month",
            value: ccNextMonth > 0 ? fmt(ccNextMonth) : "-",
            hint: <span className="text-xs text-muted-foreground">{ccNextMonth > 0 ? `building for ${nextMonthName}` : "nothing yet"}</span>,
          }] : []),
          {
            label: "Pending",
            value: isProjected ? fmt(dispPending) : fmt(totalPendingWithCarryOver),
            valueClass: "text-negative",
            onClick: isProjected ? undefined : () => setShowPendingDrilldown(true),
            hint: isProjected
              ? <span className="text-xs text-muted-foreground">projected</span>
              : totalPendingWithCarryOver > grandIncome
                ? <span className="text-xs text-negative">{fmt(totalPendingWithCarryOver - grandIncome)} over income</span>
                : undefined,
          },
          ...(!isProjected ? [{
            label: "Cash/UPI Bal",
            value: fmt(Math.max(0, inHandNow)),
            valueClass: "text-positive",
            onClick: () => setShowCashDrilldown(true),
            hint: openingBalance !== 0
              ? <span className="text-xs text-muted-foreground">{openingBalance > 0 ? "+" : "-"}{fmt(Math.abs(openingBalance))} carried over</span>
              : undefined,
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

      <TabsUnderline
        value={tab}
        onChange={setTab}
        options={[
          { value: "payables", label: "Payables", count: pendingCount },
          { value: "spends", label: "Daily Spend" },
        ]}
        className="mt-3"
      />

      {/* Charts live in a persistent side column next to whichever tab's
          content is active — never full-width at the top, never appended
          below both tabs — so they're always visible alongside the list,
          not competing for the page's primary vertical flow. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-6">
      {tab === "payables" && (
      <div className="space-y-6">
        {/* Carried Over — unpaid bills still sitting in earlier months.
            Never copied into this month (see setupMonth) — paying one here
            settles the real original entry, in its real original month,
            dated to right now. */}
        {carriedOver.length > 0 && (
          <div className="space-y-2">
            <p className="fin-label px-0.5">Carried Over From Earlier Months</p>
            <div className="space-y-3">
              {Object.entries(
                carriedOver.reduce<Record<string, CarriedOverEntry[]>>((acc, item) => {
                  const key = `${item.month.year}-${item.month.month}`;
                  (acc[key] ??= []).push(item);
                  return acc;
                }, {})
              ).map(([key, items]) => {
                const [y, m] = key.split("-").map(Number);
                return (
                  <div key={key} className="space-y-1.5">
                    <p className="text-xs text-muted-foreground px-0.5">{formatMonthYear(m, y)}</p>
                    <div className="space-y-1.5">
                      {items.map(item => (
                        <EntryRow
                          key={item.id}
                          entry={{
                            id: item.id, amount: item.amount, isPaid: false, paidOn: null,
                            paidAmount: item.paidAmount, cashbackAmount: item.cashbackAmount, notes: null,
                            template: {
                              name: item.template.name, category: item.template.category,
                              customCategory: item.template.customCategory, isFixed: true,
                              dueDateDay: item.template.dueDateDay, statementDay: item.template.statementDay,
                              loanInterestRate: null, loanRateType: null, loanOriginalPrincipal: null,
                              loanStartDate: null, loanOutstandingOverride: null,
                            },
                          }}
                          onUpdate={(_id, updates) => handleCarriedOverUpdate(item, updates)}
                          ccTemplates={ccTemplates}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Due Soon — nearest unpaid items across recurring + CC, so what
            needs action is glanceable without opening any category. */}
        {upcomingPayments.length > 0 && (
          <div className="space-y-2">
            <p className="fin-label px-0.5">Due Soon</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 snap-x">
              {upcomingPayments.map(p => {
                const color = getCategoryColor(p.category, p.customCategory);
                const Icon = getCategoryIcon(p.category, p.customCategory);
                return (
                  <div key={p.id} className="shrink-0 snap-start w-40 rounded-xl border border-border bg-card p-2.5 space-y-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CategoryBadge icon={Icon} color={color} size="sm" />
                      <span className="text-xs font-medium truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-semibold tabular-nums">{fmt(p.amount)}</span>
                      <span className={cn("text-xs font-medium shrink-0", p.overdue ? "text-negative" : "text-warning")}>
                        {p.overdue ? "overdue" : ordinal(p.dueDay)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recurring Payments and Pending Card Payments only ever show
            what's still unsettled; anything fully paid — a whole category
            or a whole card — sinks into one combined Paid section at the
            very bottom instead of lingering between two groups that still
            need action (e.g. a paid-off Loan category sitting above
            still-pending CC bills). */}
        {(() => {
        const renderCategoryCard = (groupKey: string, items: GroupedItem[]) => {
            const firstEntry   = items.find(i => i.kind === "entry");
            const firstProj    = items.find(i => i.kind === "projected");
            const sampleCat = firstEntry?.kind === "entry"
              ? { cat: firstEntry.data.template.category, custom: firstEntry.data.template.customCategory }
              : firstProj?.kind === "projected"
                ? { cat: firstProj.data.category, custom: firstProj.data.customCategory }
                : { cat: groupKey, custom: null };
            const catColor = getCategoryColor(sampleCat.cat, sampleCat.custom);
            const catIcon  = getCategoryIcon(sampleCat.cat, sampleCat.custom);
            const catLabel = getCategoryDisplay(sampleCat.cat, sampleCat.custom);
            const entryItems    = items.filter(i => i.kind === "entry") as { kind: "entry"; data: EntryWithTemplate }[];
            const projectedItems = items.filter(i => i.kind === "projected") as { kind: "projected"; data: ProjectedEntry }[];
            const catTotal = isProjected
              ? projectedItems.reduce((s, i) => s + i.data.amount, 0)
              : entryItems.filter(i => !isBillPending(i.data, isCurrentMonth, todayDay)).reduce((s, i) => s + net(i.data), 0);
            const catPaid  = entryItems.reduce((s, i) => s + effectivePaid(i.data), 0);
            const allPaid  = !isProjected && entryItems.length > 0 && entryItems.every(i => i.data.isPaid);
            const collapsed = isGroupCollapsed(groupKey);
            const paidPct = catTotal > 0 ? Math.min(100, Math.round((catPaid / catTotal) * 100)) : 0;

            return (
                <div
                  key={groupKey}
                  className={cn(
                    "rounded-xl border overflow-hidden transition-colors",
                    allPaid ? "border-border/60 bg-muted/20" : "border-border bg-card"
                  )}
                  style={{ viewTransitionName: `cat-${groupKey.replace(/[^a-zA-Z0-9-_]/g, "")}` } as CSSProperties}
                >
                {/* Clickable header — muted when settled, so a fully-paid
                    category visually recedes instead of carrying the same
                    weight as ones still needing action. */}
                <button
                  type="button"
                  onClick={() => toggleGroup(groupKey)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={cn(allPaid && "opacity-50")}>
                      <CategoryBadge icon={catIcon} color={catColor} />
                    </span>
                    <span className={cn("text-sm font-semibold truncate", allPaid && "text-muted-foreground")}>{catLabel}</span>
                    {allPaid && (
                      <span className="text-xs text-positive font-medium shrink-0">✓</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("text-sm font-semibold tabular-nums", allPaid && "text-muted-foreground")}>{fmt(catTotal)}</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200", !collapsed && "rotate-180")} />
                  </div>
                </button>

                {/* Paid/total progress — visible even collapsed, so the
                    state of a category is legible without opening it. */}
                {!isProjected && entryItems.length > 0 && !allPaid && (
                  <div className="px-3 pb-3 -mt-1 space-y-1">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${paidPct}%`, backgroundColor: catColor }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{fmt(catPaid)} of {fmt(catTotal)} paid</p>
                  </div>
                )}

                {/* Collapsible content */}
                {!collapsed && (
                  <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border">
                    {projectedItems.map((item, idx) => (
                      <ProjectedEntryRow key={idx} entry={item.data} />
                    ))}
                    {entryItems.map(item => (
                      <EntryRow key={item.data.id} entry={item.data} onUpdate={handleEntryUpdate} ccTemplates={ccTemplates} />
                    ))}
                  </div>
                )}
                </div>
            );
        };

        const renderCCItem = (item: GroupedItem) => {
          if (item.kind === "projected") return <ProjectedEntryRow key={item.data.name} entry={item.data} />;
          const entry = item.data;
          const statementDay = entry.template.statementDay;
          const hasPostCloseSpend = adHocItems.some(t =>
            t.type === "EXPENSE" && t.ccTemplateId === entry.templateId &&
            !isPreCloseDate(new Date(t.date), statementDay)
          );
          const cardTransactions = ccTransactionsByCard.get(entry.templateId) ?? [];
          return (
            <CCCardBlock
              key={entry.id}
              entry={entry}
              hasPostCloseSpend={hasPostCloseSpend}
              nextMonthName={nextMonthName}
              isBillPending={isBillPending(entry, isCurrentMonth, todayDay)}
              onUpdate={handleEntryUpdate}
              onClearStatement={handleClearStatement}
              collapsed={isCCCardCollapsed(entry.id)}
              onToggle={() => toggleCCCard(entry.id)}
              transactions={cardTransactions}
            />
          );
        };

        // grouped/ccEntries are already sorted unsettled-first — just split
        // on that boundary instead of re-deriving isSettled from scratch.
        const groupedEntries = Object.entries(grouped);
        const isGroupSettled = ([, items]: [string, GroupedItem[]]) => {
          const entryItems = items.filter(i => i.kind === "entry");
          return !isProjected && entryItems.length > 0 && entryItems.every(i => i.data.isPaid);
        };
        const unsettledGroups = groupedEntries.filter(g => !isGroupSettled(g));
        const settledGroups   = groupedEntries.filter(isGroupSettled);

        const unsettledCC = ccEntries.filter(item => item.kind === "projected" || !item.data.isPaid);
        const settledCC   = ccEntries.filter(item => item.kind === "entry" && item.data.isPaid);

        const recurringSection = unsettledGroups.length > 0 && (
          <div className="space-y-2.5" key="recurring">
            <p className="fin-label px-0.5">Recurring Payments</p>
            {unsettledGroups.map(([groupKey, items]) => renderCategoryCard(groupKey, items))}
          </div>
        );

        const ccSection = unsettledCC.length > 0 && (
          <div className="space-y-2.5" key="cc">
            <p className="fin-label px-0.5">Pending Card Payments</p>
            {unsettledCC.map(renderCCItem)}
          </div>
        );

        const paidSection = (settledGroups.length > 0 || settledCC.length > 0) && (
          <div className="space-y-2.5" key="paid">
            <p className="fin-label px-0.5">Paid</p>
            {settledGroups.map(([groupKey, items]) => renderCategoryCard(groupKey, items))}
            {settledCC.map(renderCCItem)}
          </div>
        );

        return <>{recurringSection}{ccSection}{paidSection}</>;
        })()}
      </div>
      )}

      {tab === "spends" && !isProjected && (
        <DailySpendsSection
          adHocItems={adHocItems}
          ccCards={ccTemplates.map(t => ({ templateId: t.id, name: t.name }))}
          onDelete={handleAdHocDelete}
          onEditRequest={handleEditRequest}
          removingIds={removingIds}
        />
      )}
      </div>

      <div className="space-y-4">
        {tab === "spends" && !isProjected && recentMonths.length > 0 && (
          <DailySpendChart
            recentMonths={recentMonths}
            targetMonth={targetMonth}
            targetYear={targetYear}
            todayMonth={todayMonth}
            todayYear={todayYear}
            fmt={fmt}
          />
        )}

        {/* Overview — Spending Health + FY trend, relevant regardless of
            which tab is active, so it stays visible in the sidebar no
            matter which tab is open. */}
        <p className="fin-label px-0.5">Overview</p>
        <DashboardCharts
          trendData={trendData}
          savingsRate={dispSavings}
          expensesDelta={isProjected ? null : expensesDelta}
          prevMonthName={isProjected ? null : prevMonthName}
          fixedAmount={dispFixed}
          variableAmount={dispVariable}
          cashSpend={isProjected ? 0 : adHocExpense}
          fyIncome={fyIncome}
          fyExpenses={fyExpenses}
          fyBalance={fyBalance}
          monthCount={recentMonths.length}
        />
      </div>
      </div>

      {/* Unified Income Dialog */}
      <Dialog open={!isProjected && showIncomeEdit} onOpenChange={v => { setShowIncomeEdit(v); if (!v) setShowAddIncome(false); }}>
        {/* Header/close button live outside the scroll area — putting
            max-h+overflow-y-auto on DialogContent itself (the same fixed-
            position element the close button is anchored to) scrolls the
            close button away with the content instead of keeping it
            reachable, and on mobile Safari a scrollable region nested
            directly inside a position:fixed ancestor can also just fail to
            respond to touch-drag at all — both read as "not responsive"
            once this dialog's content is long enough to need scrolling. */}
        <DialogContent className="max-w-sm max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-5 pb-3 border-b border-border/60 shrink-0">
            <DialogTitle>Income: {formatMonthYear(currentMonth?.month ?? viewMonth, currentMonth?.year ?? viewYear)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-5 pt-4 overflow-y-auto overscroll-contain">
            {/* Recurring income from templates */}
            <div className="rounded-xl bg-muted/30 border px-3 py-2.5 space-y-1.5">
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
                            <div className="flex items-center gap-2">
                              {override && (
                                <button
                                  type="button"
                                  onClick={() => handleIncomeOverrideReset(t.id)}
                                  className="p-1.5 rounded text-muted-foreground active:bg-muted active:text-negative transition-colors"
                                  title="Reset to template amount"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
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

      {/* Pending drilldown */}
      <Dialog open={showPendingDrilldown} onOpenChange={setShowPendingDrilldown}>
        <DialogContent className="max-w-sm max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-5 pb-3 border-b border-border/60 shrink-0">
            <DialogTitle>Pending: {formatMonthYear(currentMonth?.month ?? viewMonth, currentMonth?.year ?? viewYear)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-5 pt-4 overflow-y-auto overscroll-contain">
            <div className="space-y-1.5">
              <p className="fin-label">This month</p>
              <div className="flex items-center justify-between text-sm rounded-lg bg-muted/30 px-3 py-2">
                <span>Recurring</span>
                <span className="font-semibold">{fmt(recurringPendingTotal)}</span>
              </div>
              {ccBillBreakdown.filter(c => !c.pending && c.outstanding > 0).map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm rounded-lg bg-muted/30 px-3 py-2">
                  <div className="min-w-0">
                    <span className="truncate">{c.name}</span>
                    {c.isPartial && <p className="text-xs text-muted-foreground">{fmt(c.amount - c.outstanding)} of {fmt(c.amount)} paid</p>}
                  </div>
                  <span className="font-semibold shrink-0 ml-2">{fmt(c.outstanding)}</span>
                </div>
              ))}
            </div>
            {(carriedOver.length > 0 || ccBillBreakdown.some(c => c.pending)) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="fin-label">Carried over from earlier months</p>
                  <span className="text-xs font-semibold">
                    {fmt(carriedOverPending + ccBillBreakdown.filter(c => c.pending).reduce((s, c) => s + c.amount, 0))}
                  </span>
                </div>
                {carriedOver.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm rounded-lg bg-muted/30 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate">{item.template.name}</p>
                      <p className="text-xs text-muted-foreground">{formatMonthYear(item.month.month, item.month.year)}</p>
                    </div>
                    <span className="font-semibold shrink-0 ml-2">{fmt(_net(item) - (item.paidAmount ?? 0))}</span>
                  </div>
                ))}
                {ccBillBreakdown.filter(c => c.pending).map(c => (
                  <div key={c.id} className="flex items-center justify-between text-sm rounded-lg bg-muted/30 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">carried, statement not closed yet</p>
                    </div>
                    <span className="font-semibold shrink-0 ml-2">{fmt(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <p className="text-sm font-semibold">Total pending</p>
              <span className="text-sm font-bold text-negative">{fmt(totalPendingWithCarryOver)}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CC Bill drilldown */}
      <Dialog open={showCCBillDrilldown} onOpenChange={setShowCCBillDrilldown}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>CC Bill: {formatMonthYear(currentMonth?.month ?? viewMonth, currentMonth?.year ?? viewYear)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 pt-1">
            {/* Only cards actually due this cycle — carried-over debt from
                a not-yet-closed card lives under Pending instead, same
                principle as Expenditure below. */}
            {ccBillBreakdown.filter(c => !c.pending).map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm rounded-lg bg-muted/30 px-3 py-2">
                <span>{c.name}</span>
                <span className="font-semibold shrink-0 ml-2">{fmt(c.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <p className="text-sm font-semibold">Total</p>
              <span className="text-sm font-bold">{fmt(dispCCBills)}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payables drilldown */}
      <Dialog open={showExpenditureDrilldown} onOpenChange={setShowExpenditureDrilldown}>
        <DialogContent className="max-w-sm max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-5 pb-3 border-b border-border/60 shrink-0">
            <DialogTitle>Payables: {formatMonthYear(currentMonth?.month ?? viewMonth, currentMonth?.year ?? viewYear)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-5 pt-4 overflow-y-auto overscroll-contain">
            <p className="text-xs text-muted-foreground">This month&apos;s own bills, plus any older debt actually paid off this month.</p>

            {/* Recurring is already fully itemized in the Payables tab —
                a summary line here is enough, no need to repeat it. */}
            <div className="flex items-center justify-between text-sm rounded-lg bg-muted/30 px-3 py-2">
              <span>Recurring (non-card)</span>
              <span className="font-semibold">{fmt(dispRecurringNonCC)}</span>
            </div>

            {/* Credit cards and one-time spends aren't listed anywhere else
                this compactly, so show the actual items, not just a total. */}
            {ccBillBreakdown.filter(c => !c.pending).length > 0 && (
              <div className="space-y-1.5">
                <p className="fin-label">Credit cards</p>
                {ccBillBreakdown.filter(c => !c.pending).map(c => (
                  <div key={c.id} className="flex items-center justify-between text-sm rounded-lg bg-muted/30 px-3 py-2">
                    <div className="min-w-0">
                      <span className="truncate">{c.name}</span>
                      {c.isPartial && <p className="text-xs text-muted-foreground">{fmt(c.amount - c.outstanding)} of {fmt(c.amount)} paid</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className={cn("text-xs", c.isPaid ? "text-positive" : "text-muted-foreground")}>{c.isPaid ? "Paid" : "Pending"}</span>
                      <span className="font-semibold">{fmt(c.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).length > 0 && (
              <div className="space-y-1.5">
                <p className="fin-label">One-time</p>
                <div className="flex items-center justify-between text-sm rounded-lg bg-muted/30 px-3 py-2">
                  <span>This month</span>
                  <span className="font-semibold">
                    {fmt(adHocItems.filter(i => i.type === "EXPENSE" && !i.ccTemplateId).reduce((s, i) => s + i.amount, 0))}
                  </span>
                </div>
              </div>
            )}

            {settledCarryOverEntries.length > 0 && (
              <div className="space-y-1.5">
                <p className="fin-label">Carried forward, settled this month</p>
                {settledCarryOverEntries.map(e => (
                  <div key={e.id} className="flex items-center justify-between text-sm rounded-lg bg-muted/30 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate">{e.template.name}</p>
                      <p className="text-xs text-muted-foreground">from {formatMonthYear(e.billMonth, e.billYear)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs text-positive">Paid</span>
                      <span className="font-semibold">{fmt(e.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <p className="text-sm font-semibold">Total</p>
              <span className="text-sm font-bold">{fmt(dispCommitted + dispAdHoc + settledCarryOverTotal)}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cash/UPI Bal drilldown */}
      <Dialog open={showCashDrilldown} onOpenChange={setShowCashDrilldown}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cash/UPI Bal: {formatMonthYear(currentMonth?.month ?? viewMonth, currentMonth?.year ?? viewYear)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-sm rounded-lg bg-muted/30 px-3 py-2">
              <span>Carried over from last month</span>
              <span className={cn("font-semibold", openingBalance < 0 && "text-negative")}>
                {openingBalance < 0 ? "-" : ""}{fmt(Math.abs(openingBalance))}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm rounded-lg bg-muted/30 px-3 py-2">
              <span>Earned this month</span>
              <span className="font-semibold text-positive">+{fmt(grandIncome)}</span>
            </div>
            <div className="flex items-center justify-between text-sm rounded-lg bg-muted/30 px-3 py-2">
              <span>Paid out this month</span>
              <span className="font-semibold text-negative">-{fmt(totalPaid + adHocExpense)}</span>
            </div>
            {carriedDebtPaid > 0 && (
              <div className="flex items-center justify-between text-sm rounded-lg bg-muted/30 px-3 py-2">
                <span>Paid toward old debts this month</span>
                <span className="font-semibold text-negative">-{fmt(carriedDebtPaid)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <p className="text-sm font-semibold">Cash/UPI balance now</p>
              <span className="text-sm font-bold text-positive">{fmt(inHandNow)}</span>
            </div>
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
          customCategories={localCustomCategories}
          subCategorySuggestions={localSubCategorySuggestions}
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

