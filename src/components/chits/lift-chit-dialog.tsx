"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, MONTHS } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { ArrowRight } from "lucide-react";

interface LiftChitDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chit: { id: string; template: { name: string }; totalValue: number; monthlyLiftedAmount: number | null };
  onLift: (data: {
    liftedAmount: number;
    monthlyLiftedAmount: number;
    liftMonth: number;
    liftYear: number;
  }) => Promise<void>;
}

export function LiftChitDialog({ open, onOpenChange, chit, onLift }: LiftChitDialogProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const now = new Date();

  const [step, setStep]               = useState<1 | 2>(1);
  const [liftMonth, setLiftMonth]     = useState(String(now.getMonth() + 1));
  const [liftYear, setLiftYear]       = useState(String(now.getFullYear()));
  const [liftedAmount, setLiftedAmount] = useState(String(chit.totalValue));
  const [monthlyAmt, setMonthlyAmt]   = useState(String(chit.monthlyLiftedAmount ?? ""));
  const [loading, setLoading]         = useState(false);

  const monthName = MONTHS[parseInt(liftMonth) - 1] ?? "";

  function handleClose(v: boolean) {
    if (!v) setStep(1);
    onOpenChange(v);
  }

  async function handleConfirm() {
    setLoading(true);
    await onLift({
      liftedAmount:        parseFloat(liftedAmount),
      monthlyLiftedAmount: parseFloat(monthlyAmt),
      liftMonth:           parseInt(liftMonth),
      liftYear:            parseInt(liftYear),
    });
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Lift {chit.template.name}</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <DialogDescription>
              The pot value will be recorded as income in the month you select.
            </DialogDescription>

            <div>
              <Label className="text-xs">Pot value received (₹)</Label>
              <Input type="number" value={liftedAmount}
                onChange={e => setLiftedAmount(e.target.value)} className="mt-1" required />
            </div>

            <div>
              <Label className="text-xs">Lifted in</Label>
              <div className="flex gap-2 mt-1">
                <select value={liftMonth} onChange={e => setLiftMonth(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {MONTHS.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
                <Input type="number" value={liftYear} onChange={e => setLiftYear(e.target.value)}
                  min="2020" max="2040" className="w-24" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Monthly payment after lifting (₹)</Label>
              <Input type="number" value={monthlyAmt} onChange={e => setMonthlyAmt(e.target.value)}
                placeholder="e.g. 18000" className="mt-1" required />
            </div>

            <Button className="w-full" type="button"
              disabled={!liftedAmount || !monthlyAmt}
              onClick={() => setStep(2)}>
              Review <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-1">
              <p className="text-xs font-medium text-green-700 uppercase tracking-wide">Income to be recorded</p>
              <p className="text-2xl font-bold text-green-700">{fmt(parseFloat(liftedAmount) || 0)}</p>
              <p className="text-sm text-green-600">{monthName} {liftYear}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              From next month, your monthly payment becomes {fmt(parseFloat(monthlyAmt) || 0)}.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)} disabled={loading}>
                Back
              </Button>
              <Button className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={handleConfirm} disabled={loading}>
                {loading ? "Recording..." : "Confirm & Lift"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
