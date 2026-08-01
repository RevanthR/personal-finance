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
  onConfirm: (salaryIncome: number) => Promise<void>;
}

// Only rendered when there's no recurring income template to derive a
// number from — with a template, the month starts automatically instead
// (see dashboard-client.tsx's auto-setup effect).
export function SetupMonthDialog({ open, onOpenChange, month, year, onConfirm }: SetupMonthDialogProps) {
  const [salary, setSalary] = useState("");
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
            Enter your income to kick off the month. All your recurring templates will auto-populate.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Total Income (₹)</Label>
            <Input
              type="number"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="e.g. 50000"
            />
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
