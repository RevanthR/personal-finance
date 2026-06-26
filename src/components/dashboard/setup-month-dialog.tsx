"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMonthYear } from "@/lib/utils";

interface SetupMonthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: number;
  year: number;
  suggestedIncome?: number;
  onConfirm: (salaryIncome: number) => Promise<void>;
}

export function SetupMonthDialog({ open, onOpenChange, month, year, suggestedIncome, onConfirm }: SetupMonthDialogProps) {
  const [salary, setSalary] = useState(suggestedIncome ? String(suggestedIncome) : "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onConfirm(parseFloat(salary) || 0);
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set Up {formatMonthYear(month, year)}</DialogTitle>
          <DialogDescription>
            {suggestedIncome
              ? "Income pre-filled from your templates — adjust if needed, then start the month."
              : "Enter your income to kick off the month. All your recurring templates will auto-populate."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Total Income (₹)</Label>
            <Input
              type="number"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="e.g. 164000"
              autoFocus
            />
            {(suggestedIncome ?? 0) > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Pre-filled from income templates · edit if your actual income differs
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Setting up..." : "Start Month"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
