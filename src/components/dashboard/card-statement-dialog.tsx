"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TabsUnderline } from "@/components/ui/tabs-underline";
import { usePrivacy } from "@/contexts/privacy-context";
import { formatCurrency, cn } from "@/lib/utils";
import { mostRecentCloseDate } from "@/lib/finance-utils";

export type CardTransaction = {
  id: string;
  name: string;
  amount: number;
  date: string;
  isCredit?: boolean;
};

interface CardStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardName: string;
  statementDay: number | null;
  transactions: CardTransaction[];
}

// Itemized view of what's actually behind a card's two numbers — this
// cycle's own bill (already generated, currently owed) vs. spend that's
// landed since and won't show up until next month. Split by a real
// chronological cutoff (mostRecentCloseDate) rather than comparing each
// transaction's day-of-month in isolation — a card whose Bill Generation
// Date falls early in the month has most of its currently-owed bill's
// transactions dated in the PREVIOUS calendar month, so day-of-month alone
// (which only ever sees one month's items) can't place them correctly.
export function CardStatementDialog({ open, onOpenChange, cardName, statementDay, transactions }: CardStatementDialogProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const [tab, setTab] = useState<"current" | "upcoming">("current");

  const byDateDesc = (a: CardTransaction, b: CardTransaction) => new Date(b.date).getTime() - new Date(a.date).getTime();
  const cycleStart = statementDay != null ? mostRecentCloseDate(statementDay) : null;
  const current  = transactions.filter(t => !cycleStart || new Date(t.date) < cycleStart).sort(byDateDesc);
  const upcoming = transactions.filter(t => cycleStart && new Date(t.date) >= cycleStart).sort(byDateDesc);
  const shown = tab === "current" ? current : upcoming;
  const shownTotal = shown.reduce((s, t) => s + (t.isCredit ? -t.amount : t.amount), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 pb-2 shrink-0">
          <DialogTitle>{cardName} statement</DialogTitle>
        </DialogHeader>
        <div className="px-4 shrink-0">
          <TabsUnderline
            value={tab}
            onChange={setTab}
            options={[
              { value: "current", label: "Generated Bill", count: current.length },
              { value: "upcoming", label: "Accumulating", count: upcoming.length },
            ]}
          />
        </div>
        {shown.length > 0 && (
          <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
            <span className="text-xs text-muted-foreground">
              {tab === "current" ? "Total billed" : "Total so far"}
            </span>
            <span className="text-sm font-semibold tabular-nums">{fmt(shownTotal)}</span>
          </div>
        )}
        <div className="px-4 pb-4 overflow-y-auto overscroll-contain">
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
                  {t.isCredit && <p className="text-xs text-positive">Credit</p>}
                </div>
                <span className={cn("text-sm font-semibold shrink-0 tabular-nums", t.isCredit ? "text-positive" : "text-foreground")}>
                  {t.isCredit ? "+" : "-"}{fmt(t.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
