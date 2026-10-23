"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { currentCycleOpen, nextCycleClose } from "@/lib/cards";
import { ChevronRight } from "lucide-react";
import { reconciliationText, type CardOverview, type CardChargeRow } from "./cards-client";

const d = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function chargesIn(charges: CardChargeRow[], start: Date, end: Date) {
  return charges
    .filter(c => !c.isCardRepayment)
    .filter(c => { const t = new Date(c.date).getTime(); return t >= start.getTime() && t < end.getTime(); })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
const sum = (rows: CardChargeRow[]) => rows.reduce((s, c) => s + (c.isCredit ? -c.amount : c.amount), 0);

function ChargeLine({ c, fmt }: { c: CardChargeRow; fmt: (v: number) => string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground truncate">{d(c.date)} · {c.name}</span>
      <span className={cn("tabular-nums shrink-0 ml-2", c.isCredit && "text-positive")}>
        {c.isCredit ? "+" : ""}{fmt(c.amount)}
      </span>
    </div>
  );
}

export function CardStatementSheet({
  open, onOpenChange, card, fmt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  card: CardOverview;
  fmt: (v: number) => string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const sd = card.statementDay;

  // The open (not yet closed) cycle.
  const openCycle = sd != null ? currentCycleOpen(sd, new Date()) : null;
  const openEnd = sd != null ? nextCycleClose(sd, new Date()) : null;
  const openCharges = openCycle && openEnd ? chargesIn(card.charges, openCycle, openEnd) : [];
  const repayments = card.charges.filter(c => c.isCardRepayment);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b border-border/60 shrink-0">
          <DialogTitle>{card.name} statements</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto overscroll-contain p-3 space-y-2">
          {sd == null && (
            <p className="text-sm text-muted-foreground text-center py-8">Set a statement date on this card to see billing cycles.</p>
          )}

          {/* Open cycle */}
          {openCycle && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Open · closes {openEnd && d(openEnd.toISOString())}</span>
                <span className="text-sm font-semibold tabular-nums">{openCharges.length ? `+${fmt(Math.round(sum(openCharges)))}` : fmt(0)}</span>
              </div>
              {openCharges.length > 0 && (
                <div className="mt-2 space-y-1">
                  {openCharges.slice(0, 40).map(c => <ChargeLine key={c.id} c={c} fmt={fmt} />)}
                </div>
              )}
            </div>
          )}

          {/* Closed statements, figures from the shared ledger */}
          {card.cycles.map(cy => {
            const rows = chargesIn(card.charges, new Date(cy.cycleStart), new Date(cy.statementDate));
            const isOpen = expanded === cy.statementDate;
            const paidTotal = cy.recordedPaid + cy.repaid;
            const paidNote = paidTotal > 0
              ? cy.outstanding === 0 ? " · paid" : ` · ${fmt(Math.round(paidTotal))} paid, ${fmt(Math.round(cy.outstanding))} left`
              : "";
            return (
              <div key={cy.statementDate} className="rounded-xl border border-border bg-card overflow-hidden">
                <button className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : cy.statementDate)}>
                  <div className="text-left">
                    <p className="text-sm font-medium">{d(cy.statementDate)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {cy.confirmed ? "confirmed" : "estimated"}{paidNote}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{fmt(Math.round(cy.gross))}</span>
                    <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                  </div>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 pt-1 space-y-1 border-t border-border">
                    {cy.confirmed && Math.abs(cy.gross - cy.estimated) > 1 && (
                      <p className="text-[11px] text-muted-foreground pb-1 leading-snug">
                        Logged {fmt(Math.round(cy.estimated))} · statement {fmt(Math.round(cy.gross))}. {reconciliationText({ delta: cy.gross - cy.estimated }, fmt)}
                      </p>
                    )}
                    {rows.length === 0 && <p className="text-xs text-muted-foreground py-2 text-center">No logged charges in this cycle.</p>}
                    {rows.map(c => <ChargeLine key={c.id} c={c} fmt={fmt} />)}
                  </div>
                )}
              </div>
            );
          })}

          {sd != null && card.cycles.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No closed statements yet.</p>
          )}

          {/* Repayments logged as transactions (bank transfer, UPI, autopay) */}
          {repayments.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground pb-1">Payments logged as transactions</p>
              {repayments.slice(0, 20).map(c => <ChargeLine key={c.id} c={c} fmt={fmt} />)}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
