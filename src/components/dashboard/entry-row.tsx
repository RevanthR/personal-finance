"use client";

import { useState, useRef } from "react";
import { formatCurrency, CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/utils";
import { Clock, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface EntryRowProps {
  entry: {
    id: string;
    amount: number;
    isPaid: boolean;
    paidOn: string | null;
    notes: string | null;
    template: {
      name: string;
      category: string;
      isFixed: boolean;
      dueDateDay: number | null;
      chitFund: { isLifted: boolean; accumulatedSavings: number } | null;
    };
  };
  onUpdate: (id: string, updates: { isPaid?: boolean; amount?: number; notes?: string }) => Promise<void>;
}

export function EntryRow({ entry, onUpdate }: EntryRowProps) {
  const [optimisticPaid, setOptimisticPaid] = useState(entry.isPaid);
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountVal, setAmountVal] = useState(String(entry.amount));
  const inputRef = useRef<HTMLInputElement>(null);

  const isPaid = optimisticPaid;
  const color = CATEGORY_COLORS[entry.template.category] ?? "#6b7280";
  const isChitInvestment = entry.template.category === "CHIT_FUND" && !entry.template.chitFund?.isLifted;

  function handleTogglePaid() {
    const next = !isPaid;
    setOptimisticPaid(next); // instant UI update
    onUpdate(entry.id, { isPaid: next }); // fire and don't await
  }

  function handleAmountClick(e: React.MouseEvent) {
    if (entry.template.isFixed || isPaid) return;
    e.stopPropagation();
    setEditingAmount(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function handleAmountBlur() {
    const num = parseFloat(amountVal);
    if (!isNaN(num) && num !== entry.amount) {
      onUpdate(entry.id, { amount: num });
    }
    setEditingAmount(false);
  }

  function handleAmountKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") inputRef.current?.blur();
    if (e.key === "Escape") { setAmountVal(String(entry.amount)); setEditingAmount(false); }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all",
        isPaid ? "bg-muted/40 border-transparent opacity-60" : "bg-card border-border"
      )}
    >
      {/* Checkbox */}
      <button
        onClick={handleTogglePaid}
        className={cn(
          "shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
          isPaid ? "bg-zinc-900 border-zinc-900" : "border-muted-foreground/50 hover:border-zinc-500"
        )}
      >
        {isPaid && <Check className="w-3 h-3 text-white" />}
      </button>

      {/* Category colour strip */}
      <div className="w-0.5 h-7 rounded-full shrink-0" style={{ backgroundColor: color }} />

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium leading-tight", isPaid && "line-through text-muted-foreground")}>
          {entry.template.name}
          {isChitInvestment && (
            <span className="ml-1.5 text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">
              saving
            </span>
          )}
          {entry.template.chitFund?.isLifted && (
            <span className="ml-1.5 text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
              lifted
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
          <span>{CATEGORY_LABELS[entry.template.category] ?? entry.template.category}</span>
          {entry.template.dueDateDay && !isPaid && (
            <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
              <Clock className="w-2.5 h-2.5" />
              {entry.template.dueDateDay}th
            </span>
          )}
          {isPaid && entry.paidOn && (
            <span className="text-green-600">
              {format(new Date(entry.paidOn), "dd MMM")}
            </span>
          )}
        </p>
      </div>

      {/* Amount — tap to edit if variable */}
      <div className="shrink-0">
        {editingAmount ? (
          <input
            ref={inputRef}
            type="number"
            value={amountVal}
            onChange={(e) => setAmountVal(e.target.value)}
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
            {formatCurrency(entry.amount)}
          </span>
        )}
      </div>
    </div>
  );
}
