"use client";

import { useState, useRef } from "react";
import { formatCurrency, getCategoryDisplay, getCategoryColor } from "@/lib/utils";
import { Clock, Check, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CCLineItem = {
  id: string; name: string; amount: number; category: string | null; date: string | null; createdAt: string;
};

const CC_CATEGORIES = ["Food", "Coffee", "Fuel", "Bills", "Shopping", "Travel", "Health", "Entertainment", "Other"];

interface EntryRowProps {
  entry: {
    id: string;
    amount: number;
    isPaid: boolean;
    paidOn: string | null;
    notes: string | null;
    statementAmount: number | null;
    ccItems: CCLineItem[];
    template: {
      name: string;
      category: string;
      customCategory: string | null;
      isFixed: boolean;
      dueDateDay: number | null;
      chitFund: { isLifted: boolean; accumulatedSavings: number } | null;
    };
  };
  monthId: string;
  onUpdate: (id: string, updates: { isPaid?: boolean; amount?: number; notes?: string; statementAmount?: number | null }) => Promise<void>;
  onCCChange: (entryId: string, ccItems: CCLineItem[], statementAmount: number | null) => void;
}

export function EntryRow({ entry, monthId, onUpdate, onCCChange }: EntryRowProps) {
  const [optimisticPaid, setOptimisticPaid] = useState(entry.isPaid);
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountVal, setAmountVal] = useState(String(entry.amount));
  const [expanded, setExpanded] = useState(false);
  const [ccItems, setCCItems] = useState<CCLineItem[]>(entry.ccItems);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [adding, setAdding] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const isPaid = optimisticPaid;
  const color = getCategoryColor(entry.template.category, entry.template.customCategory);
  const isCC = entry.template.category === "CREDIT_CARD";
  const isChitInvestment = entry.template.category === "CHIT_FUND" && !entry.template.chitFund?.isLifted;
  const ccTotal = ccItems.reduce((s, i) => s + i.amount, 0);

  // Group items by category for display
  const itemsByCategory = ccItems.reduce<Record<string, CCLineItem[]>>((acc, item) => {
    const key = item.category ?? "Uncategorised";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  function handleTogglePaid() {
    const next = !isPaid;
    setOptimisticPaid(next);
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

  function handleExpand(e: React.MouseEvent) {
    e.stopPropagation();
    setExpanded(v => {
      if (!v) setTimeout(() => nameRef.current?.focus(), 50);
      return !v;
    });
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    const amount = parseFloat(newAmount);
    if (!name || isNaN(amount) || amount <= 0) return;

    setAdding(true);
    const res = await fetch(`/api/months/${monthId}/entries/${entry.id}/cc-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, amount, category: newCategory || null }),
    });
    setAdding(false);

    if (!res.ok) { toast.error("Failed to add item"); return; }
    const { item, statementAmount } = await res.json();
    const next = [...ccItems, item];
    setCCItems(next);
    onCCChange(entry.id, next, statementAmount);
    setNewName("");
    setNewAmount("");
    setNewCategory("");
    nameRef.current?.focus();
  }

  async function handleDeleteItem(itemId: string) {
    const res = await fetch(
      `/api/months/${monthId}/entries/${entry.id}/cc-items?id=${itemId}`,
      { method: "DELETE" }
    );
    if (!res.ok) { toast.error("Failed to remove item"); return; }
    const { statementAmount } = await res.json();
    const next = ccItems.filter(i => i.id !== itemId);
    setCCItems(next);
    onCCChange(entry.id, next, statementAmount);
  }

  return (
    <div className={cn("rounded-xl border transition-all", isPaid ? "bg-muted/40 border-transparent opacity-60" : "bg-card border-border")}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          onClick={handleTogglePaid}
          className={cn(
            "shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
            isPaid ? "bg-zinc-900 border-zinc-900" : "border-muted-foreground/50 hover:border-zinc-500"
          )}
        >
          {isPaid && <Check className="w-3 h-3 text-white" />}
        </button>

        <div className="w-0.5 h-7 rounded-full shrink-0" style={{ backgroundColor: color }} />

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
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>{getCategoryDisplay(entry.template.category, entry.template.customCategory)}</span>
            {entry.template.dueDateDay && !isPaid && (
              <span className="flex items-center gap-0.5 text-amber-600">
                <Clock className="w-2.5 h-2.5" />{entry.template.dueDateDay}th
              </span>
            )}
            {isPaid && entry.paidOn && (
              <span className="text-green-600">{format(new Date(entry.paidOn), "dd MMM")}</span>
            )}
            {isCC && ccItems.length > 0 && (
              <span className="text-muted-foreground/60">
                {ccItems.length} item{ccItems.length !== 1 ? "s" : ""} · {formatCurrency(ccTotal)} this month
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {editingAmount ? (
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
              {formatCurrency(entry.amount)}
            </span>
          )}

          {isCC && (
            <button onClick={handleExpand} className="text-muted-foreground hover:text-foreground transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* CC items panel */}
      {isCC && expanded && (
        <div className="border-t border-border mx-3 mb-3 pt-2">

          {/* Items grouped by category */}
          {Object.keys(itemsByCategory).length > 0 && (
            <div className="space-y-2 mb-3">
              {Object.entries(itemsByCategory).map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{cat}</p>
                  {items.map(item => (
                    <div key={item.id} className="flex items-center gap-2 py-0.5 group">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs">{item.name}</span>
                        {item.date && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">
                            {format(new Date(item.date), "dd MMM")}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium tabular-nums">{formatCurrency(item.amount)}</span>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex items-center justify-between pt-1.5 border-t border-border">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Statement total</span>
                <span className="text-sm font-bold tabular-nums">{formatCurrency(ccTotal)}</span>
              </div>
            </div>
          )}

          {/* Add item form */}
          <form onSubmit={handleAddItem} className="space-y-2">
            {/* Category chips */}
            <div className="flex flex-wrap gap-1">
              {CC_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setNewCategory(c => c === cat ? "" : cat)}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                    newCategory === cat
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "border-border text-muted-foreground hover:border-zinc-400"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Name + amount + add */}
            <div className="flex items-center gap-2">
              <Plus className="w-3 h-3 text-muted-foreground shrink-0" />
              <input
                ref={nameRef}
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Item name"
                className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/50 min-w-0"
              />
              <input
                type="number"
                value={newAmount}
                onChange={e => setNewAmount(e.target.value)}
                placeholder="₹ amount"
                className="w-20 text-right text-xs bg-transparent outline-none placeholder:text-muted-foreground/50"
              />
              <button
                type="submit"
                disabled={adding || !newName.trim() || !newAmount}
                className="text-xs font-semibold text-zinc-900 disabled:text-muted-foreground/40 transition-colors"
              >
                Add
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
