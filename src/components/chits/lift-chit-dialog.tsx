"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";

interface LiftChitDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chit: { id: string; template: { name: string }; totalValue: number; monthlyLiftedAmount: number | null };
  onLift: (data: { liftedAmount: number; liftedUsedFor: string; monthlyLiftedAmount: number }) => Promise<void>;
}

export function LiftChitDialog({ open, onOpenChange, chit, onLift }: LiftChitDialogProps) {
  const [liftedAmount, setLiftedAmount] = useState(String(chit.totalValue));
  const [usedFor, setUsedFor] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState(String(chit.monthlyLiftedAmount ?? ""));
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onLift({
      liftedAmount: parseFloat(liftedAmount),
      liftedUsedFor: usedFor,
      monthlyLiftedAmount: parseFloat(monthlyAmount),
    });
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Lift Chit — {chit.template.name}</DialogTitle>
          <DialogDescription>
            Once lifted, this chit switches from an investment to an expense. Your monthly payment will increase.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-xs">Amount Received (₹)</Label>
            <Input
              type="number"
              value={liftedAmount}
              onChange={(e) => setLiftedAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <Label className="text-xs">New Monthly Amount — post-lift (₹)</Label>
            <Input
              type="number"
              value={monthlyAmount}
              onChange={(e) => setMonthlyAmount(e.target.value)}
              placeholder="Higher amount after lifting"
              required
            />
          </div>
          <div>
            <Label className="text-xs">How is the money being used?</Label>
            <Input
              value={usedFor}
              onChange={(e) => setUsedFor(e.target.value)}
              placeholder="e.g. Cleared personal loan, Home renovation"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-700">
              {loading ? "Lifting..." : `Lift ${chit.template.name}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
