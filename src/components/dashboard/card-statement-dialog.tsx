"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TabsUnderline } from "@/components/ui/tabs-underline";
import { Button } from "@/components/ui/button";
import { usePrivacy } from "@/contexts/privacy-context";
import { formatCurrency, cn } from "@/lib/utils";
import { mostRecentCloseDate, type CCReconciliation } from "@/lib/finance-utils";
import { Pencil, Trash2 } from "lucide-react";
import type { AdHocItem } from "@/types/adhoc-item";

// Full AdHocItem shape, not just what's shown — a repayment row's edit/
// delete buttons (see onEditRequest/onDelete below) hand the whole item
// straight to the same handlers Daily Spend uses, which need every field
// AdHocDialog's edit form reads.
export type CardTransaction = AdHocItem;

interface CardStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardName: string;
  statementDay: number | null;
  transactions: CardTransaction[];
  // False when the card's statement hasn't closed yet AND nothing is
  // actually carried over from an earlier bill — i.e. the one-cycle window
  // below would land on an already-PAID-OFF month, which isn't "the
  // generated bill" in any meaningful sense even though real charges
  // exist there. See CCCardBlock's own carriedInAmount/isBillPending.
  hasOutstandingBill: boolean;
  // Ledger figures + captured/gap for this card (see reconcileCard). When
  // the itemised charges below don't add up to what the card block and
  // tiles show, this dialog says so instead of leaving the reader to
  // notice a silent mismatch.
  reconciliation?: CCReconciliation;
  // Only offered for repayment rows (see the isCardRepayment check below) —
  // this dialog stays a read-only itemized view for normal charges, same as
  // before; repayments need SOME way to fix or remove a mistake now that
  // excluding them from Daily Spend (see daily-spends-section.tsx) also
  // removed their only other edit/delete surface.
  onEditRequest?: (item: CardTransaction) => void;
  onDelete?: (id: string) => void;
  removingIds?: Set<string>;
}

// Itemized view of what's actually behind a card's two numbers — this
// cycle's own bill (already generated, currently owed) vs. spend that's
// landed since and won't show up until next month. Split by a real
// chronological cutoff (mostRecentCloseDate) rather than comparing each
// transaction's day-of-month in isolation — a card whose Bill Generation
// Date falls early in the month has most of its currently-owed bill's
// transactions dated in the PREVIOUS calendar month, so day-of-month alone
// (which only ever sees one month's items) can't place them correctly.
export function CardStatementDialog({ open, onOpenChange, cardName, statementDay, transactions, hasOutstandingBill, reconciliation, onEditRequest, onDelete, removingIds }: CardStatementDialogProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const [tab, setTab] = useState<"current" | "upcoming">("current");

  const byDateDesc = (a: CardTransaction, b: CardTransaction) => new Date(b.date).getTime() - new Date(a.date).getTime();
  const cycleStart = statementDay != null ? mostRecentCloseDate(statementDay) : null;
  // "Generated Bill" is exactly ONE cycle — everything from the close
  // before last up to the most recent close — not "everything ever dated
  // before now". Without a lower bound this pulled in every older month's
  // spend too (a card with 6 months of history summed all 6 into "the
  // bill", instead of just the one cycle currently outstanding).
  const prevCycleStart = cycleStart
    ? new Date(cycleStart.getFullYear(), cycleStart.getMonth() - 1, statementDay!)
    : null;
  const current = transactions.filter(t => {
    if (!cycleStart) return hasOutstandingBill;
    if (!hasOutstandingBill) return false;
    const d = new Date(t.date);
    return d < cycleStart && (!prevCycleStart || d >= prevCycleStart);
  }).sort(byDateDesc);
  const upcoming = transactions.filter(t => cycleStart && new Date(t.date) >= cycleStart).sort(byDateDesc);
  const shown = tab === "current" ? current : upcoming;
  const shownTotal = shown.reduce((s, t) => s + (t.isCredit ? -t.amount : t.amount), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b border-border/60 shrink-0">
          <DialogTitle>{cardName} statement</DialogTitle>
        </DialogHeader>
        <div className="px-5 pt-3 shrink-0">
          <TabsUnderline
            value={tab}
            onChange={setTab}
            options={[
              { value: "current", label: "Generated Bill", count: current.length },
              { value: "upcoming", label: "Accumulating", count: upcoming.length },
            ]}
          />
        </div>
        {shown.length > 0 && (() => {
          const gap = reconciliation && tab === "current"
            ? (reconciliation.hasBillGap ? reconciliation.billGap : 0)
            : reconciliation && tab === "upcoming"
              ? (reconciliation.hasAccumulatingGap ? reconciliation.accumulatingGap : 0)
              : 0;
          const ledgerFigure = reconciliation && tab === "current"
            ? reconciliation.bill + reconciliation.cashback
            : reconciliation?.accumulating ?? 0;
          return (
            <div className="px-5 pt-3 pb-1 shrink-0 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {tab === "current" ? "These charges" : "Accumulated so far"}
                </span>
                <span className="text-sm font-semibold tabular-nums">{fmt(shownTotal)}</span>
              </div>
              {gap !== 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {tab === "current" ? "On the statement" : "In this cycle's total"}
                    </span>
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">{fmt(ledgerFigure)}</span>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground pt-0.5">
                    {tab === "current"
                      ? (gap < 0
                          ? `${fmt(-gap)} of these charges isn't on the bank statement. It rolls into next cycle's bill.`
                          : `${fmt(gap)} on the statement isn't itemised here yet.`)
                      : (gap < 0
                          ? `${fmt(-gap)} of these charges isn't in the running total yet.`
                          : `${fmt(gap)} counted that isn't itemised here.`)}
                  </p>
                </>
              )}
            </div>
          );
        })()}
        <div className="px-5 pb-5 overflow-y-auto overscroll-contain">
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {tab === "current" ? "No charges on this bill." : "Nothing accumulating yet."}
            </p>
          ) : (
            shown.map(t => (
              <div key={t.id} className="flex items-center gap-3 py-2.5 border-b border-border/60 last:border-b-0">
                <div className="w-9 shrink-0 text-center">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-tight">
                    {format(new Date(t.date), "MMM")}
                  </div>
                  <div className="text-sm font-semibold tabular-nums leading-tight">
                    {format(new Date(t.date), "d")}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  {t.isCredit && <p className="text-xs text-positive">{t.isCardRepayment ? "Repayment" : "Credit"}</p>}
                </div>
                <span className={cn("text-sm font-semibold shrink-0 tabular-nums", t.isCredit ? "text-positive" : "text-foreground")}>
                  {t.isCredit ? "+" : "-"}{fmt(t.amount)}
                </span>
                {t.isCardRepayment && onEditRequest && (
                  <Button variant="ghost" size="sm" onClick={() => onEditRequest(t)} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
                {t.isCardRepayment && onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removingIds?.has(t.id)}
                    onClick={() => onDelete(t.id)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-negative shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
