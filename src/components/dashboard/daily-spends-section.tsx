"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CategoryBadge } from "@/components/ui/category-badge";
import { formatCurrency, getCategoryDisplay, getCategoryColor, getCategoryIcon, getSubCategoryIcon, groupItemsByCategory, cn } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { Pencil, Trash2, ChevronDown, CreditCard, Wallet } from "lucide-react";
import { format } from "date-fns";

export type AdHocItem = {
  id: string; name: string; amount: number; type: string;
  category: string | null; customCategory: string | null; customCategoryId: string | null; subCategory: string | null;
  date: string; notes: string | null; ccTemplateId: string | null;
};

interface DailySpendsSectionProps {
  adHocItems: AdHocItem[];
  ccCards: { templateId: string; name: string }[];
  onDelete: (id: string) => void;
  onEditRequest: (item: AdHocItem) => void;
  removingIds: Set<string>;
}

// Every ad-hoc transaction — cash and card alike — grouped category ->
// sub-category, each row tagged with its payment method. Card charges no
// longer live nested inside their card's block; the bill/dues side of a
// card lives in PendingCardPaymentsSection instead, this is purely "what
// did I spend, on what, via which mode, on which day."
export function DailySpendsSection({ adHocItems, ccCards, onDelete, onEditRequest, removingIds }: DailySpendsSectionProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const expenseItems = adHocItems.filter(i => i.type === "EXPENSE");

  const groups = groupItemsByCategory(expenseItems).map(v => {
    // Items with no sub-category land in "Other" — same bucket the picker
    // sheet writes when you explicitly pick "Other", and the same fallback
    // months/page.tsx uses, so a null subCategory and a literal "Other"
    // string always converge on one group instead of two near-duplicate
    // ones ("General" vs "Other") splitting what's really the same bucket.
    const bySub = new Map<string, AdHocItem[]>();
    for (const item of v.items) {
      const subKey = item.subCategory ?? "Other";
      if (!bySub.has(subKey)) bySub.set(subKey, []);
      bySub.get(subKey)!.push(item);
    }
    const subGroups = [...bySub.entries()]
      .map(([subKey, items]) => ({ key: subKey, items, total: items.reduce((s, i) => s + i.amount, 0) }))
      .sort((a, b) => b.total - a.total);
    return {
      key: v.key,
      category: v.category,
      customCategory: v.customCategory,
      label: getCategoryDisplay(v.category, v.customCategory),
      color: getCategoryColor(v.category, v.customCategory),
      icon: getCategoryIcon(v.category, v.customCategory),
      total: v.total,
      subGroups,
    };
  }).sort((a, b) => b.total - a.total);

  if (groups.length === 0) return null;

  const visibleGroups = activeFilter ? groups.filter(g => g.key === activeFilter) : groups;

  // Categories default open (so the sub-category list is visible without an
  // extra tap — the whole point of this redesign), sub-categories default
  // closed (their transaction lists can get long).
  function isCollapsed(key: string, defaultCollapsed: boolean) {
    return key in collapsedGroups ? collapsedGroups[key] : defaultCollapsed;
  }
  function toggle(key: string, defaultCollapsed: boolean) {
    setCollapsedGroups(prev => ({ ...prev, [key]: !isCollapsed(key, defaultCollapsed) }));
  }

  return (
    <div>
      <div className="px-0.5 mb-2">
        <span className="fin-label">Daily / Regular Spends</span>
      </div>

      {/* Category filter — tap to narrow the list to one category, tap
          again (or "All") to clear. Built from the same grouped data below
          rather than a separate query. */}
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <Chip label="All" active={activeFilter === null} onClick={() => setActiveFilter(null)} />
          {groups.map(g => (
            <Chip key={g.key} label={g.label} active={activeFilter === g.key} onClick={() => setActiveFilter(activeFilter === g.key ? null : g.key)} />
          ))}
        </div>
      )}

      {/* 2-up on desktop — a category card is fundamentally a compact list
          (icon, name, total, sub-category rows), it doesn't need the full
          lg:col-span-2 content width. items-start so a collapsed card next
          to a taller expanded one doesn't stretch to match its height. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        {visibleGroups.map(g => {
          const catCollapsed = isCollapsed(g.key, false);
          return (
            <div key={g.key} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Category — its own collapse (default open, so the
                  sub-category list is visible without an extra tap), plus
                  each sub-category below has its own independent collapse. */}
              <button
                type="button"
                onClick={() => toggle(g.key, false)}
                className="w-full flex items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <CategoryBadge icon={g.icon} color={g.color} />
                  <span className="text-sm font-semibold truncate">{g.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">{fmt(g.total)}</span>
                  <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200", !catCollapsed && "rotate-180")} />
                </div>
              </button>

              {!catCollapsed && (
                <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-border">
                  {g.subGroups.map(sg => {
                    const subKey = `${g.key}::${sg.key}`;
                    const collapsed = isCollapsed(subKey, true);
                    const SubIcon = getSubCategoryIcon(sg.key);
                    return (
                      <div key={sg.key}>
                        <button
                          type="button"
                          onClick={() => toggle(subKey, true)}
                          className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors hover:bg-muted/40"
                        >
                          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <SubIcon className="w-3.5 h-3.5 text-muted-foreground" />
                            {sg.key} <span className="text-muted-foreground/70">({sg.items.length})</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{fmt(sg.total)}</span>
                            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200", !collapsed && "rotate-180")} />
                          </div>
                        </button>
                        {!collapsed && (
                          <div className="space-y-1.5 mt-1.5">
                            {sg.items.map(item => (
                              <TransactionRow key={item.id} item={item} ccCards={ccCards} onDelete={onDelete} onEditRequest={onEditRequest} isRemoving={removingIds.has(item.id)} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TransactionRow({ item, ccCards, onDelete, onEditRequest, isRemoving }: {
  item: AdHocItem; ccCards: { templateId: string; name: string }[];
  onDelete: (id: string) => void; onEditRequest?: (item: AdHocItem) => void; isRemoving?: boolean;
}) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const isCarryForward = item.notes === "carry_forward";
  const cardName = item.ccTemplateId ? ccCards.find(c => c.templateId === item.ccTemplateId)?.name : null;

  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-card transition-all duration-150",
      isCarryForward && "border-warning-border bg-warning-bg/40",
      isRemoving && "opacity-0 scale-95 pointer-events-none"
    )}>
      <div className={cn("w-0.5 h-7 rounded-full shrink-0", item.type === "INCOME" ? "bg-positive" : "bg-negative")} />
      {/* Payment method — icon instead of a text pill, still labeled for
          screen readers and on hover, less text noise per row. */}
      <span
        className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground"
        title={cardName ? `Card · ${cardName}` : "Cash/UPI"}
        aria-label={cardName ? `Paid by card: ${cardName}` : "Paid by cash or UPI"}
      >
        {cardName ? <CreditCard className="w-3 h-3" /> : <Wallet className="w-3 h-3" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium">{item.name}</p>
          {isCarryForward && (
            <span className="text-xs font-semibold text-warning bg-warning-bg px-1 py-0.5 rounded">carried fwd</span>
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
