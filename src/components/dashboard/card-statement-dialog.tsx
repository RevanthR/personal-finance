"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TabsUnderline } from "@/components/ui/tabs-underline";
import { usePrivacy } from "@/contexts/privacy-context";
import { formatCurrency, cn } from "@/lib/utils";
import { isPreCloseDate } from "@/lib/finance-utils";

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
// cycle's own bill (Bill Generation Date already passed, or would have for
// a transaction dated before it) vs. spend that's landed since and won't
// show up until next month. Same isPreCloseDate split cc-effects.ts already
// uses to decide which bucket a charge belongs to — reused here for
// display rather than re-deriving the boundary a second time.
export function CardStatementDialog({ open, onOpenChange, cardName, statementDay, transactions }: CardStatementDialogProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const [tab, setTab] = useState<"current" | "upcoming">("current");

  const byDateDesc = (a: CardTransaction, b: CardTransaction) => new Date(b.date).getTime() - new Date(a.date).getTime();
  const current = transactions.filter(t => isPreCloseDate(new Date(t.date), statementDay)).sort(byDateDesc);
  const upcoming = transactions.filter(t => !isPreCloseDate(new Date(t.date), statementDay)).sort(byDateDesc);
  const shown = tab === "current" ? current : upcoming;

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
        <div className="p-4 pt-3 space-y-1.5 overflow-y-auto overscroll-contain">
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions here.</p>
          ) : (
            shown.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(t.date), "dd MMM yyyy")} · {t.isCredit ? "Credit" : "Debit"}</p>
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
