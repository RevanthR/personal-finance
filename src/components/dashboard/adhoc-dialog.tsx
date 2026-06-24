"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_LABELS } from "@/lib/utils";
import { format } from "date-fns";

interface AdHocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: {
    name: string;
    amount: number;
    type: string;
    category?: string;
    date: string;
    notes?: string;
  }) => Promise<void>;
}

export function AdHocDialog({ open, onOpenChange, onAdd }: AdHocDialogProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !amount) return;
    setLoading(true);
    await onAdd({
      name,
      amount: parseFloat(amount),
      type,
      category: category || undefined,
      date,
      notes: notes || undefined,
    });
    setLoading(false);
    // reset
    setName(""); setAmount(""); setType("EXPENSE"); setCategory(""); setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Ad-hoc Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType("EXPENSE")}
              className={`py-2 rounded-lg text-sm font-medium border transition-colors ${type === "EXPENSE" ? "bg-rose-500 text-white border-rose-500" : "border-border text-muted-foreground"}`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType("INCOME")}
              className={`py-2 rounded-lg text-sm font-medium border transition-colors ${type === "INCOME" ? "bg-emerald-500 text-white border-emerald-500" : "border-border text-muted-foreground"}`}
            >
              Income
            </button>
          </div>

          <div>
            <Label className="text-xs">Description</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Birthday gift" required />
          </div>
          <div>
            <Label className="text-xs">Amount (₹)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" required />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes..." />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700">
              {loading ? "Adding..." : "Add Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
