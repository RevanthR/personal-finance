"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";

interface LiftChitDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chit: { id: string; template: { name: string }; totalValue: number; monthlyLiftedAmount: number | null };
  onLift: (data: {
    liftedAmount: number;
    liftedUsedFor: string;
    monthlyLiftedAmount: number;
    liftMonth: number;
    liftYear: number;
  }) => Promise<void>;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export function LiftChitDialog({ open, onOpenChange, chit, onLift }: LiftChitDialogProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const now = new Date();
  const [liftedAmount, setLiftedAmount] = useState(String(chit.totalValue));
  const [usedFor, setUsedFor] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState(String(chit.monthlyLiftedAmount ?? ""));
  const [liftMonth, setLiftMonth] = useState(String(now.getMonth() + 1));
  const [liftYear, setLiftYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onLift({
      liftedAmount: parseFloat(liftedAmount),
      liftedUsedFor: usedFor,
      monthlyLiftedAmount: parseFloat(monthlyAmount),
      liftMonth: parseInt(liftMonth),
      liftYear: parseInt(liftYear),
    });
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Lift Chit — {chit.template.name}</DialogTitle>
          <DialogDescription>
            Once lifted, this chit switches from a receivable to an expense. Your monthly payment will increase from next month.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-xs">Amount Received (₹)</Label>
            <Input
              type="number"
              value={liftedAmount}
              onChange={(e) => setLiftedAmount(e.target.value)}
              placeholder={fmt(chit.totalValue)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Lifted In</Label>
              <select
                value={liftMonth}
                onChange={(e) => setLiftMonth(e.target.value)}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Year</Label>
              <Input
                type="number"
                value={liftYear}
                onChange={(e) => setLiftYear(e.target.value)}
                min="2020"
                max="2040"
                required
              />
            </div>
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
