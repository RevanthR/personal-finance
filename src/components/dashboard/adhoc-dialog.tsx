"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const EXPENSE_CATEGORIES = [
  { value: "HOUSE_MAINTENANCE", label: "House" },
  { value: "LOAN",              label: "Loan" },
  { value: "CREDIT_CARD",       label: "Credit Card" },
  { value: "PERSONAL",          label: "Personal" },
  { value: "MISCELLANEOUS",     label: "Misc" },
];

const CC_SPEND_CATEGORIES = [
  "Food", "Coffee", "Groceries", "Fuel", "Shopping",
  "Travel", "Health", "Bills", "Entertainment", "Other",
];

const INCOME_SOURCES = [
  { value: "salary",        label: "Bonus" },
  { value: "freelance",     label: "Freelance" },
  { value: "reimbursement", label: "Refund" },
  { value: "other",         label: "Other" },
];

interface AdHocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: { name: string; amount: number; type: string; category?: string; date: string; notes?: string }) => Promise<void>;
  ccCards: string[];
}

export function AdHocDialog({ open, onOpenChange, onAdd, ccCards }: AdHocDialogProps) {
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [category, setCategory] = useState("");
  const [ccCard, setCCCard] = useState(ccCards[0] ?? "");
  const [ccSpendCat, setCCSpendCat] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const isCC = category === "CREDIT_CARD";

  function reset() {
    setType("EXPENSE"); setCategory(""); setCCCard(ccCards[0] ?? "");
    setCCSpendCat(""); setName(""); setAmount("");
    setDate(format(new Date(), "yyyy-MM-dd")); setNotes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !amount) return;
    setLoading(true);

    // For CC expenses, build a rich notes string so the data is queryable later
    const notesStr = isCC
      ? [ccCard, ccSpendCat, notes].filter(Boolean).join(" · ")
      : notes || undefined;

    await onAdd({
      name,
      amount: parseFloat(amount),
      type,
      category: category || undefined,
      date,
      notes: notesStr || undefined,
    });

    setLoading(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Expense / Income toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
            {(["EXPENSE", "INCOME"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setCategory(""); setCCSpendCat(""); }}
                className={cn(
                  "py-1.5 rounded-md text-sm font-semibold transition-all",
                  type === t
                    ? t === "INCOME"
                      ? "bg-green-700 text-white shadow-sm"
                      : "bg-white text-zinc-900 shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "EXPENSE" ? "Expense" : "Income"}
              </button>
            ))}
          </div>

          {/* Category chips */}
          <div>
            <Label className="text-xs mb-2 block">
              {type === "EXPENSE" ? "Category" : "Source"} <span className="text-muted-foreground">(optional)</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {(type === "EXPENSE" ? EXPENSE_CATEGORIES : INCOME_SOURCES).map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => { setCategory(category === c.value ? "" : c.value); setCCSpendCat(""); }}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                    category === c.value
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* CC sub-options — shown only when Credit Card category is selected */}
          {isCC && (
            <>
              {/* Card picker — only if multiple CC cards */}
              {ccCards.length > 1 && (
                <div>
                  <Label className="text-xs mb-2 block">Which card?</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ccCards.map(card => (
                      <button
                        key={card}
                        type="button"
                        onClick={() => setCCCard(card)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                          ccCard === card
                            ? "bg-zinc-900 text-white border-zinc-900"
                            : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground"
                        )}
                      >
                        {card}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Spend category */}
              <div>
                <Label className="text-xs mb-2 block">Spend category <span className="text-muted-foreground">(optional)</span></Label>
                <div className="flex flex-wrap gap-1.5">
                  {CC_SPEND_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCCSpendCat(c => c === cat ? "" : cat)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                        ccSpendCat === cat
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <Label className="text-xs">Description</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={
                isCC ? "e.g. Zomato, Amazon, Petrol" :
                type === "INCOME" ? "e.g. Bonus, Refund" :
                "e.g. Birthday gift"
              }
              autoFocus
              required
            />
          </div>

          <div>
            <Label className="text-xs">Amount (₹)</Label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              required
            />
          </div>

          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {!isCC && (
            <div>
              <Label className="text-xs">Notes <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes..." />
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading || !name || !amount} className="w-full">
              {loading ? "Adding..." : type === "INCOME" ? "Add Income" : "Add Expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
