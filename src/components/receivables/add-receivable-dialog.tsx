"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CATEGORIES = [
  { value: "INVESTMENT", label: "Investment" },
  { value: "PERSONAL_LOAN", label: "Personal Loan" },
  { value: "CUSTOM", label: "Custom" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

interface AddReceivableDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (data: {
    category: Category;
    customCategory?: string;
    description: string;
    expectedAmount: number;
    expectedDate?: string;
  }) => Promise<void>;
}

export function AddReceivableDialog({ open, onOpenChange, onAdd }: AddReceivableDialogProps) {
  const [category, setCategory] = useState<Category>("INVESTMENT");
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setCategory("INVESTMENT");
    setCustomCategory("");
    setDescription("");
    setExpectedAmount("");
    setExpectedDate("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onAdd({
      category,
      customCategory: category === "CUSTOM" ? customCategory : undefined,
      description,
      expectedAmount: parseFloat(expectedAmount),
      expectedDate: expectedDate || undefined,
    });
    reset();
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Receivable</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-xs">Category</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    category === c.value
                      ? "bg-slate-900 text-white border-slate-900"
                      : "border-slate-300 text-slate-600 hover:border-slate-500"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {category === "CUSTOM" && (
            <div>
              <Label className="text-xs">Custom Category Name</Label>
              <Input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="e.g. FD Maturity, Chit Savings"
                required
              />
            </div>
          )}

          <div>
            <Label className="text-xs">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Lent to Ravi, HDFC FD"
              required
            />
          </div>

          <div>
            <Label className="text-xs">Expected Amount (₹)</Label>
            <Input
              type="number"
              value={expectedAmount}
              onChange={(e) => setExpectedAmount(e.target.value)}
              placeholder="e.g. 50000"
              required
            />
          </div>

          <div>
            <Label className="text-xs">Expected By (optional)</Label>
            <Input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Adding..." : "Add Receivable"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
