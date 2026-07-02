"use client";

import { useState, useRef } from "react";
import { formatCurrency, getCategoryDisplay, getCategoryColor } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { Clock, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeLoanAmortization, computeChitCurrentMonth } from "@/lib/loan-utils";

// Partial payment doesn't carry forward for these categories
const NO_PARTIAL = new Set(["LOAN", "CHIT_FUND"]);

interface EntryRowProps {
  entry: {
    id: string;
    amount: number;
    isPaid: boolean;
    paidOn: string | null;
    paidAmount: number | null;
    cashbackAmount: number | null;
    notes: string | null;
    template: {
      name: string;
      category: string;
      customCategory: string | null;
      isFixed: boolean;
      dueDateDay: number | null;
      statementDay: number | null;
      chitFund: { isLifted: boolean; accumulatedSavings: number; startDate: string | null; durationMonths: number | null } | null;
      loanInterestRate: number | null;
      loanRateType: string | null;
      loanOriginalPrincipal: number | null;
      loanStartDate: string | null;
      loanOutstandingOverride: number | null;
    };
  };
  onUpdate: (id: string, updates: { isPaid?: boolean; amount?: number; notes?: string; paidAmount?: number; cashbackAmount?: number }) => Promise<void>;
  isBillPending?: boolean;
}

export function EntryRow({ entry, onUpdate, isBillPending = false }: EntryRowProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const [optimisticPaid, setOptimisticPaid] = useState(entry.isPaid);
  const [optimisticPaidAmount, setOptimisticPaidAmount] = useState(entry.paidAmount);
  const [optimisticCashback, setOptimisticCashback] = useState(entry.cashbackAmount);
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountVal, setAmountVal] = useState(String(entry.amount));

  // Payment dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [payMode, setPayMode] = useState<"full" | "partial">("full");
  const [partialVal, setPartialVal] = useState("");
  const [cashbackVal, setCashbackVal] = useState("");
  const partialRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  // Loan payment success state — snapshot of amortization at time of payment
  const [loanPaidSnapshot, setLoanPaidSnapshot] = useState<{
    emi: number;
    principalThisMonth: number;
    interestThisMonth: number;
    outstandingBefore: number;
    outstandingAfter: number;
    totalInterestRemaining: number;
    monthsRemaining: number;
  } | null>(null);

  const isPaid = optimisticPaid;
  const paidAmount = optimisticPaidAmount;
  const cashback = optimisticCashback ?? 0;
  const isCC = entry.template.category === "CREDIT_CARD";
  const netBill = entry.amount - cashback;
  const isPartial = !isPaid && paidAmount != null && paidAmount > 0;
  const outstanding = netBill - (paidAmount ?? 0);
  const color = getCategoryColor(entry.template.category, entry.template.customCategory);
  const isChitInvestment = entry.template.category === "CHIT_FUND" && !entry.template.chitFund?.isLifted;
  const canPartial = !NO_PARTIAL.has(entry.template.category);
  const isLoan = entry.template.category === "LOAN";
  const loanAmort = isLoan && entry.template.loanInterestRate != null ? computeLoanAmortization({
    emi: entry.amount,
    annualRate: entry.template.loanInterestRate,
    originalPrincipal: entry.template.loanOriginalPrincipal,
    startDate: entry.template.loanStartDate,
    outstandingOverride: entry.template.loanOutstandingOverride,
    isPaidThisMonth: isPaid,
  }) : null;

  function handleTickClick() {
    if (isPaid) {
      setOptimisticPaid(false);
      setOptimisticPaidAmount(null);
      onUpdate(entry.id, { isPaid: false });
      return;
    }
    if (!canPartial) {
      setOptimisticPaid(true);
      setOptimisticPaidAmount(null);
      onUpdate(entry.id, { isPaid: true });
      // Show loan payment breakdown if amortization data is available
      if (isLoan && loanAmort) {
        setLoanPaidSnapshot({
          emi: entry.amount,
          principalThisMonth: loanAmort.principalThisMonth,
          interestThisMonth: loanAmort.interestThisMonth,
          outstandingBefore: loanAmort.outstandingPrincipal,
          outstandingAfter: Math.max(0, loanAmort.outstandingPrincipal - loanAmort.principalThisMonth),
          totalInterestRemaining: Math.max(0, loanAmort.totalInterestRemaining - loanAmort.interestThisMonth),
          monthsRemaining: Math.max(0, loanAmort.monthsRemaining - 1),
        });
      }
      return;
    }
    setPayMode("full");
    setPartialVal(paidAmount != null ? String(outstanding) : "");
    setCashbackVal(cashback > 0 ? String(cashback) : "");
    setShowDialog(true);
  }

  function parsedCashback() {
    const n = parseFloat(cashbackVal);
    return isNaN(n) || n <= 0 ? 0 : Math.min(n, entry.amount);
  }

  async function handlePayFull() {
    const cb = parsedCashback();
    setOptimisticPaid(true);
    setOptimisticPaidAmount(null);
    setOptimisticCashback(cb > 0 ? cb : null);
    setShowDialog(false);
    await onUpdate(entry.id, { isPaid: true, ...(isCC && { cashbackAmount: cb }) });
  }

  async function handleSavePartial() {
    const num = parseFloat(partialVal);
    if (isNaN(num) || num < 0) return;
    const cb = parsedCashback();
    const netAmt = entry.amount - cb;
    if (num >= netAmt) {
      setOptimisticPaid(true);
      setOptimisticPaidAmount(null);
    } else {
      setOptimisticPaidAmount(num > 0 ? num : null);
    }
    setOptimisticCashback(cb > 0 ? cb : null);
    setShowDialog(false);
    await onUpdate(entry.id, { paidAmount: num, ...(isCC && { cashbackAmount: cb }) });
  }

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
        <button
          onClick={isBillPending ? undefined : handleTickClick}
          disabled={isBillPending}
          className={cn(
            "shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
            isPaid
              ? "bg-zinc-900 border-zinc-900"
              : isBillPending
                ? "border-zinc-300 bg-zinc-50 cursor-not-allowed"
                : isPartial
                  ? "border-amber-500 bg-amber-50"
                  : "border-muted-foreground/50 hover:border-zinc-500"
          )}
        >
          {isPaid && <Check className="w-3 h-3 text-white" />}
          {isPartial && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
        </button>

        <div className={cn("w-0.5 rounded-full shrink-0 transition-all duration-200", isPaid ? "h-4" : "h-7")} style={{ backgroundColor: color }} />

        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-medium leading-tight", isPaid && "line-through text-muted-foreground")}>
            {entry.template.name}
            {isChitInvestment && (
              <span className="ml-1.5 text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">saving</span>
            )}
            {entry.template.chitFund?.isLifted && (
              <span className="ml-1.5 text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600">lifted</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <span>{getCategoryDisplay(entry.template.category, entry.template.customCategory)}</span>
            {entry.template.chitFund && !isPaid && (
              <span className={cn("text-[10px]", entry.template.chitFund.isLifted ? "text-zinc-400" : "text-emerald-600")}>
                {entry.template.chitFund.isLifted ? "lifted" : `${fmt(entry.template.chitFund.accumulatedSavings)} saved`}
              </span>
            )}
            {entry.template.category === "CHIT_FUND" && entry.template.chitFund?.startDate && entry.template.chitFund?.durationMonths && (
              <span className="text-[10px] text-muted-foreground/70">
                month {computeChitCurrentMonth(entry.template.chitFund.startDate)} of {entry.template.chitFund.durationMonths}
              </span>
            )}
            {isLoan && loanAmort && loanAmort.monthsRemaining > 0 && !isPaid && (
              <span className="text-[10px] text-muted-foreground/70">
                {loanAmort.monthsRemaining} mo left
              </span>
            )}
            {isBillPending && entry.template.statementDay && (
              <span className="text-[10px] text-zinc-400 italic">
                Statement closes {entry.template.statementDay}th
              </span>
            )}
            {!isBillPending && entry.template.category === "CREDIT_CARD" && entry.template.statementDay && !isPaid && (
              <span className="text-[10px] text-blue-500">
                closes {entry.template.statementDay}th
                {entry.template.dueDateDay ? ` · due ${entry.template.dueDateDay}th` : ""}
              </span>
            )}
            {entry.template.category !== "CREDIT_CARD" && entry.template.dueDateDay && !isPaid && (
              <span className="flex items-center gap-0.5 text-amber-600">
                <Clock className="w-2.5 h-2.5" />{entry.template.dueDateDay}th
              </span>
            )}
            {isPaid && entry.paidOn && (
              <span className="text-green-600">{format(new Date(entry.paidOn), "dd MMM")}</span>
            )}
            {isLoan && entry.template.loanInterestRate && (
              <span className="text-[10px] text-muted-foreground/70">{entry.template.loanInterestRate}%</span>
            )}
          </p>
          {loanAmort && !isPaid && (
            <p className="text-[10px] mt-0.5 flex items-center gap-1">
              <span className="text-emerald-600">{fmt(loanAmort.principalThisMonth)} principal</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-red-400">{fmt(loanAmort.interestThisMonth)} interest</span>
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          {isPartial && !editingAmount ? (
            <>
              <p className="text-xs text-amber-600 font-semibold">{fmt(paidAmount!)} paid</p>
              <p className="text-[10px] text-muted-foreground">{fmt(outstanding)} left</p>
            </>
          ) : editingAmount ? (
            <input
              ref={amountRef}
              type="number"
              value={amountVal}
              onChange={e => setAmountVal(e.target.value)}
              onBlur={handleAmountBlur}
              onKeyDown={handleAmountKey}
              className="w-24 text-right text-sm font-semibold bg-transparent border-b border-zinc-400 outline-none"
            />
          ) : cashback > 0 && !isPaid ? (
            <>
              <p className="text-sm font-semibold">{fmt(netBill)}</p>
              <p className="text-[10px] text-green-600">-{fmt(cashback)} cashback</p>
            </>
          ) : (
            <span
              onClick={handleAmountClick}
              className={cn(
                "text-sm font-semibold",
                !entry.template.isFixed && !isPaid && "cursor-pointer hover:text-zinc-600 underline decoration-dotted underline-offset-2"
              )}
            >
              {fmt(entry.amount)}
            </span>
          )}
        </div>
      </div>

      {/* Payment dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base">{entry.template.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Bill summary */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Bill amount</span>
                <span className="font-semibold">{fmt(entry.amount)}</span>
              </div>
              {/* Cashback field — only for CC entries */}
              {isCC && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-green-700">Cashback</span>
                  <Input
                    type="number"
                    value={cashbackVal}
                    onChange={e => setCashbackVal(e.target.value)}
                    placeholder="0"
                    className="h-7 w-28 text-right text-sm text-green-700 border-green-200 focus:border-green-400"
                  />
                </div>
              )}
              {isCC && parsedCashback() > 0 && (
                <div className="flex items-center justify-between text-sm border-t border-dashed border-border pt-1.5">
                  <span className="font-medium">Net payable</span>
                  <span className="font-bold">{fmt(entry.amount - parsedCashback())}</span>
                </div>
              )}
              {isPartial && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Already paid</span>
                  <span className="text-amber-600 font-semibold">{fmt(paidAmount!)}</span>
                </div>
              )}
            </div>

            {/* Mode toggle */}
            <div className="flex gap-2 bg-zinc-100 rounded-lg p-1">
              <button
                onClick={() => setPayMode("full")}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-sm font-medium transition-colors",
                  payMode === "full" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                Pay in full
              </button>
              <button
                onClick={() => {
                  setPayMode("partial");
                  setTimeout(() => partialRef.current?.focus(), 50);
                }}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-sm font-medium transition-colors",
                  payMode === "partial" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                Partial
              </button>
            </div>

            {payMode === "full" ? (
              <Button className="w-full" onClick={handlePayFull}>
                Mark paid · {fmt(entry.amount - parsedCashback())}
              </Button>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Amount paying now (₹)</Label>
                  <Input
                    ref={partialRef}
                    type="number"
                    value={partialVal}
                    onChange={e => setPartialVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSavePartial(); }}
                    placeholder={`up to ${fmt(outstanding)}`}
                    className="mt-1"
                  />
                </div>
                <button
                  onClick={() => setPartialVal(String(outstanding))}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 rounded-lg border border-dashed transition-colors"
                >
                  Pay remaining {fmt(outstanding)}
                </button>
                <Button className="w-full" onClick={handleSavePartial}>
                  Save partial payment
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loan payment success popup */}
      <Dialog open={!!loanPaidSnapshot} onOpenChange={open => { if (!open) setLoanPaidSnapshot(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-white" />
              </span>
              Loan payment recorded
            </DialogTitle>
          </DialogHeader>
          {loanPaidSnapshot && (
            <div className="space-y-3 pt-1">
              <p className="text-sm font-medium">{entry.template.name}</p>

              {/* EMI split */}
              <div className="rounded-xl bg-zinc-50 p-3 space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">This month's payment</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">EMI paid</span>
                  <span className="font-semibold tabular-nums">{fmt(loanPaidSnapshot.emi)}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-600">↓ Principal</span>
                  <span className="font-medium text-emerald-600 tabular-nums">{fmt(loanPaidSnapshot.principalThisMonth)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-red-500">Interest paid</span>
                  <span className="font-medium text-red-500 tabular-nums">{fmt(loanPaidSnapshot.interestThisMonth)}</span>
                </div>
              </div>

              {/* Remaining balance */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-1.5">
                <p className="text-[10px] text-emerald-700 uppercase tracking-wide">After this payment</p>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-emerald-800">Outstanding balance</span>
                  <span className="text-base font-bold text-emerald-700 tabular-nums">{fmt(loanPaidSnapshot.outstandingAfter)}</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-600">
                  <span>Interest remaining</span>
                  <span className="tabular-nums">{fmt(loanPaidSnapshot.totalInterestRemaining)}</span>
                </div>
                {loanPaidSnapshot.monthsRemaining > 0 && (
                  <p className="text-[10px] text-emerald-600">{loanPaidSnapshot.monthsRemaining} month{loanPaidSnapshot.monthsRemaining !== 1 ? "s" : ""} to go</p>
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
