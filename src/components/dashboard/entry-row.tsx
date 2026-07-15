"use client";

import { useState, useRef } from "react";
import { formatCurrency, getCategoryDisplay, getCategoryColor, ordinal } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { Clock, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePaymentTick, type PaymentTick, type PaymentTickEntry, type PaymentTickUpdate } from "@/hooks/use-payment-tick";
import { PaymentDialog } from "./payment-dialog";

interface EntryRowProps {
  entry: PaymentTickEntry & {
    paidOn: string | null;
    notes: string | null;
    template: {
      name: string;
      category: string;
      customCategory: string | null;
      isFixed: boolean;
      dueDateDay: number | null;
      statementDay: number | null;
    };
  };
  onUpdate: PaymentTickUpdate;
  isBillPending?: boolean;
  // Shared tick state — pass this when the tick can also be triggered from
  // elsewhere (e.g. a CC card's collapsed header), so both surfaces stay in
  // sync. When omitted, this row owns its own tick state (standalone use).
  tick?: PaymentTick;
}

export function EntryRow({ entry, onUpdate, isBillPending = false, tick: externalTick }: EntryRowProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountVal, setAmountVal] = useState(String(entry.amount));
  const amountRef = useRef<HTMLInputElement>(null);

  const internalTick = usePaymentTick(entry, onUpdate);
  const tick = externalTick ?? internalTick;
  const isControlled = externalTick != null;
  const {
    isPaid, paidAmount, cashback, isCC, netBill, isPartial, outstanding, isLoan, loanAmort,
    handleTickClick, loanPaidSnapshot, setLoanPaidSnapshot,
  } = tick;

  const color = getCategoryColor(entry.template.category, entry.template.customCategory);

  function handleAmountClick(e: React.MouseEvent) {
    if (entry.template.isFixed || isPaid) return;
    e.stopPropagation();
    setEditingAmount(true);
    setTimeout(() => amountRef.current?.select(), 0);
  }

  function handleAmountBlur() {
    const num = parseFloat(amountVal);
    if (!isNaN(num) && num !== entry.amount) onUpdate(entry.id, { amount: num });
    setEditingAmount(false);
  }

  function handleAmountKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") amountRef.current?.blur();
    if (e.key === "Escape") { setAmountVal(String(entry.amount)); setEditingAmount(false); }
  }

  return (
    <>
      <div className={cn(
        "flex items-center gap-3 px-3 rounded-xl border transition-all duration-200",
        isPaid ? "py-1.5 bg-muted/30 border-transparent opacity-50" : "py-2.5 bg-card border-border",
        isBillPending && !isPaid && "opacity-60"
      )}>
        {/* 44px tap target wrapping the 20px visual circle */}
        <button
          onClick={isBillPending ? undefined : handleTickClick}
          disabled={isBillPending}
          className="shrink-0 flex items-center justify-center w-11 h-11 -mx-3 rounded-full"
        >
          <div className={cn(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all pointer-events-none",
            isPaid
              ? "bg-positive border-positive"
              : isBillPending
                ? "border-primary/40 bg-accent"
                : isPartial
                  ? "border-warning bg-warning-bg"
                  : "border-warning/70 bg-warning-bg/40"
          )}>
            {isPaid && <Check className="w-3 h-3 text-white" />}
            {isPartial && <span className="w-1.5 h-1.5 rounded-full bg-warning" />}
          </div>
        </button>

        <div className={cn("w-0.5 rounded-full shrink-0 transition-all duration-200", isPaid ? "h-4" : "h-7")} style={{ backgroundColor: color }} />

        <div className="flex-1 min-w-0">
          {/* Inside a CC card, the card header above already establishes the
              card name and "current cycle" — no label needed here at all. */}
          {!isControlled && (
            <p className={cn("text-sm font-medium leading-tight", isPaid && "line-through text-muted-foreground")}>
              {entry.template.name}
            </p>
          )}
          {(!isControlled || (isPaid && entry.paidOn)) && (
            <p className={cn("text-xs text-muted-foreground flex items-center gap-1.5", !isControlled && "mt-0.5")}>
              {!isControlled && <span>{getCategoryDisplay(entry.template.category, entry.template.customCategory)}</span>}
              {isLoan && loanAmort && loanAmort.monthsRemaining > 0 && (
                <span className="text-muted-foreground/70">
                  {loanAmort.monthsRemaining} mo left
                </span>
              )}
              {entry.template.category !== "CREDIT_CARD" && entry.template.dueDateDay && !isPaid && (
                <span className="flex items-center gap-0.5 text-warning">
                  <Clock className="w-2.5 h-2.5" />{ordinal(entry.template.dueDateDay)}
                </span>
              )}
              {isPaid && entry.paidOn && (
                <span className="text-positive">{format(new Date(entry.paidOn), "dd MMM")}</span>
              )}
              {isLoan && entry.template.loanInterestRate && (
                <span className="text-muted-foreground/70">{entry.template.loanInterestRate}%</span>
              )}
            </p>
          )}
          {loanAmort && !isPaid && (
            <p className="text-xs mt-0.5 flex items-center gap-1">
              <span className="text-positive">{fmt(loanAmort.principalThisMonth)} principal</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-negative">{fmt(loanAmort.interestThisMonth)} interest</span>
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          {isPartial && !editingAmount ? (
            <>
              <p className="text-xs text-warning font-semibold">{fmt(paidAmount!)} paid</p>
              <p className="text-xs text-muted-foreground">{fmt(outstanding)} left</p>
            </>
          ) : editingAmount ? (
            <input
              ref={amountRef}
              type="number"
              value={amountVal}
              onChange={e => setAmountVal(e.target.value)}
              onBlur={handleAmountBlur}
              onKeyDown={handleAmountKey}
              className="w-24 text-right text-sm font-semibold bg-transparent border-b border-border outline-none"
            />
          ) : cashback > 0 && !isPaid ? (
            <>
              <p className="text-sm font-semibold">{fmt(netBill)}</p>
              <p className="text-xs text-positive">-{fmt(cashback)} cashback</p>
            </>
          ) : (
            <>
              <span
                onClick={handleAmountClick}
                className={cn(
                  "text-sm font-semibold",
                  !entry.template.isFixed && !isPaid && "cursor-pointer hover:text-muted-foreground underline decoration-dotted underline-offset-2"
                )}
              >
                {fmt(entry.amount)}
              </span>
              {isCC && !isPaid && !isBillPending && entry.template.dueDateDay && (
                <p className="text-xs text-warning">due {ordinal(entry.template.dueDateDay)}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Payment dialog — only when this row owns its own tick state.
          When shared (e.g. inside a CC card), the parent renders it once. */}
      {!isControlled && (
        <PaymentDialog tick={tick} entryName={entry.template.name} amount={entry.amount} fmt={fmt} />
      )}

      {/* Loan payment success popup */}
      <Dialog open={!!loanPaidSnapshot} onOpenChange={open => { if (!open) setLoanPaidSnapshot(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-positive flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-white" />
              </span>
              Loan payment recorded
            </DialogTitle>
          </DialogHeader>
          {loanPaidSnapshot && (
            <div className="space-y-3 pt-1">
              <p className="text-sm font-medium">{entry.template.name}</p>

              <div className="rounded-xl bg-muted p-3 space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">This month&apos;s payment</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">EMI paid</span>
                  <span className="font-semibold tabular-nums">{fmt(loanPaidSnapshot.emi)}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex justify-between text-xs">
                  <span className="text-positive">↓ Principal</span>
                  <span className="font-medium text-positive tabular-nums">{fmt(loanPaidSnapshot.principalThisMonth)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-negative">Interest paid</span>
                  <span className="font-medium text-negative tabular-nums">{fmt(loanPaidSnapshot.interestThisMonth)}</span>
                </div>
              </div>

              <div className="rounded-xl border border-positive-border bg-positive-bg p-3 space-y-1.5">
                <p className="text-xs text-positive uppercase tracking-wide">After this payment</p>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-positive/80">Outstanding balance</span>
                  <span className="text-base font-bold text-positive tabular-nums">{fmt(loanPaidSnapshot.outstandingAfter)}</span>
                </div>
                <div className="flex justify-between text-xs text-positive">
                  <span>Interest remaining</span>
                  <span className="tabular-nums">{fmt(loanPaidSnapshot.totalInterestRemaining)}</span>
                </div>
                {loanPaidSnapshot.monthsRemaining > 0 && (
                  <p className="text-xs text-positive">{loanPaidSnapshot.monthsRemaining} month{loanPaidSnapshot.monthsRemaining !== 1 ? "s" : ""} to go</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button className="w-full" onClick={() => setLoanPaidSnapshot(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
