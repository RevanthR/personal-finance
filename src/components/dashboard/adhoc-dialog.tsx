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
  { value: "LOAN", label: "Loan" },
  { value: "CREDIT_CARD", label: "CC" },
  { value: "PERSONAL", label: "Personal" },
  { value: "MISCELLANEOUS", label: "Misc" },
];

const INCOME_SOURCES = [
  { value: "salary", label: "Bonus" },
  { value: "freelance", label: "Freelance" },
  { value: "reimbursement", label: "Refund" },
  { value: "other", label: "Other" },
];

interface AdHocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: { name: string; amount: number; type: string; category?: string; date: string; notes?: string }) => Promise<void>;
}

export function AdHocDialog({ open, onOpenChange, onAdd }: AdHocDialogProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setName(""); setAmount(""); setType("EXPENSE"); setCategory("");
    setNotes(""); setDate(format(new Date(), "yyyy-MM-dd"));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !amount) return;
    setLoading(true);
    await onAdd({ name, amount: parseFloat(amount), type, category: category || undefined, date, notes: notes || undefined });
    setLoading(false);
    reset();
  }

  const chips = type === "EXPENSE" ? EXPENSE_CATEGORIES : INCOME_SOURCES;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Income / Expense toggle */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button" variant={type === "EXPENSE" ? "destructive" : "outline"}
              onClick={() => { setType("EXPENSE"); setCategory(""); }}
            >
              Expense
            </Button>
            <Button
              type="button"
              variant={type === "INCOME" ? "default" : "outline"}
              className={type === "INCOME" ? "bg-green-700 hover:bg-green-800 text-white" : ""}
              onClick={() => { setType("INCOME"); setCategory(""); }}
            >
              Income
            </Button>
          </div>

          {/* Category / Source chips */}
          <div>
            <Label className="text-xs mb-2 block">
              {type === "EXPENSE" ? "Category (optional)" : "Source (optional)"}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {chips.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(category === c.value ? "" : c.value)}
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

          <div>
            <Label className="text-xs">Description</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={type === "INCOME" ? "e.g. Bonus, Refund" : "e.g. Birthday gift"}
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

          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes..." />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={loading || !name || !amount}
              className="w-full"
            >
              {loading ? "Adding..." : `Add ${type === "INCOME" ? "Income" : "Expense"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
