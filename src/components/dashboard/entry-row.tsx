"use client";

import { useState, useRef } from "react";
import { formatCurrency, getCategoryDisplay, getCategoryColor } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { Clock, Check, IndianRupee } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CARRY_FORWARD_EXCLUDE = new Set(["LOAN", "CHIT_FUND"]);

interface EntryRowProps {
  entry: {
    id: string;
    amount: number;
    isPaid: boolean;
    paidOn: string | null;
    paidAmount: number | null;
    notes: string | null;
    template: {
      name: string;
      category: string;
      customCategory: string | null;
      isFixed: boolean;
      dueDateDay: number | null;
      statementDay: number | null;
      chitFund: { isLifted: boolean; accumulatedSavings: number } | null;
    };
  };
  onUpdate: (id: string, updates: { isPaid?: boolean; amount?: number; notes?: string; paidAmount?: number }) => Promise<void>;
}

export function EntryRow({ entry, onUpdate }: EntryRowProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const [optimisticPaid, setOptimisticPaid] = useState(entry.isPaid);
  const [optimisticPaidAmount, setOptimisticPaidAmount] = useState(entry.paidAmount);
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountVal, setAmountVal] = useState(String(entry.amount));
  const [showPartial, setShowPartial] = useState(false);
  const [partialVal, setPartialVal] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);
  const partialRef = useRef<HTMLInputElement>(null);

  const isPaid = optimisticPaid;
  const paidAmount = optimisticPaidAmount;
  const isPartial = !isPaid && paidAmount != null && paidAmount > 0;
  const outstanding = entry.amount - (paidAmount ?? 0);

  const color = getCategoryColor(entry.template.category, entry.template.customCategory);
  const isChitInvestment = entry.template.category === "CHIT_FUND" && !entry.template.chitFund?.isLifted;
  const canPartialPay = !isPaid && !CARRY_FORWARD_EXCLUDE.has(entry.template.category);

  function handleTogglePaid() {
    const next = !isPaid;
    setOptimisticPaid(next);
    if (next) setOptimisticPaidAmount(null);
    onUpdate(entry.id, { isPaid: next });
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

  function openPartial() {
    setPartialVal(paidAmount != null ? String(paidAmount) : "");
    setShowPartial(true);
    setTimeout(() => partialRef.current?.select(), 100);
  }

  async function handleSavePartial() {
    const num = parseFloat(partialVal);
    if (isNaN(num) || num < 0) return;
    if (num >= entry.amount) {
      // Auto-complete
      setOptimisticPaid(true);
      setOptimisticPaidAmount(null);
    } else {
      setOptimisticPaidAmount(num > 0 ? num : null);
    }
    setShowPartial(false);
    await onUpdate(entry.id, { paidAmount: num });
  }

  return (
    <>
      <div className={cn(
        "flex items-center gap-3 px-3 rounded-xl border transition-all duration-200",
        isPaid ? "py-1.5 bg-muted/30 border-transparent opacity-50" : "py-2.5 bg-card border-border"
      )}>
        <button
          onClick={handleTogglePaid}
          className={cn(
            "shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
            isPaid
              ? "bg-zinc-900 border-zinc-900"
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
            {entry.template.category === "CREDIT_CARD" && entry.template.statementDay && !isPaid && (
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
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
          {canPartialPay && !editingAmount && (
            <button
              onClick={openPartial}
              className="p-1 rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
              title="Record partial payment"
            >
              <IndianRupee className="w-3 h-3" />
            </button>
          )}

          {isPartial && !editingAmount ? (
            <div className="text-right">
              <p className="text-xs text-amber-600 font-semibold">{fmt(paidAmount!)} paid</p>
              <p className="text-[10px] text-muted-foreground">{fmt(outstanding)} left</p>
            </div>
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

      <Dialog open={showPartial} onOpenChange={setShowPartial}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base">{entry.template.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total due</span>
              <span className="font-semibold">{fmt(entry.amount)}</span>
            </div>
            {paidAmount != null && paidAmount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Already paid</span>
                <span className="text-amber-600 font-semibold">{fmt(paidAmount)}</span>
              </div>
            )}
            <div>
              <Label className="text-xs">Amount paying now (₹)</Label>
              <Input
                ref={partialRef}
                type="number"
                value={partialVal}
                onChange={e => setPartialVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSavePartial(); }}
                placeholder={`max ${fmt(outstanding)}`}
                className="mt-1"
                autoFocus
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => { setPartialVal(String(outstanding)); }}
            >
              Pay remaining {fmt(outstanding)}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPartial(false)}>Cancel</Button>
            <Button onClick={handleSavePartial}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
