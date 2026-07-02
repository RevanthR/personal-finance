"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface AddChitDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (data: {
    name: string;
    totalValue: number;
    durationMonths: number;
    startDate: string;
    monthlyUnliftedAmount: number;
    monthlyLiftedAmount?: number;
    dueDateDay?: number;
  }) => Promise<void>;
}

function computeEndLabel(startMonth: number, startYear: number, duration: number): string {
  if (!startMonth || !startYear || !duration) return "";
  const totalMonths = (startMonth - 1) + duration - 1;
  const endMonth = (totalMonths % 12) + 1;
  const endYear = startYear + Math.floor(totalMonths / 12);
  return `${MONTHS[endMonth - 1]} ${endYear}`;
}

export function AddChitDialog({ open, onOpenChange, onAdd }: AddChitDialogProps) {
  const now = new Date();
  const [name, setName] = useState("");
  const [totalValue, setTotalValue] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [startMonth, setStartMonth] = useState(now.getMonth() + 1);
  const [startYear, setStartYear] = useState(now.getFullYear());
  const [monthlyUnlifted, setMonthlyUnlifted] = useState("");
  const [monthlyLifted, setMonthlyLifted] = useState("");
  const [dueDateDay, setDueDateDay] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setName(""); setTotalValue(""); setDurationMonths("");
    setStartMonth(now.getMonth() + 1); setStartYear(now.getFullYear());
    setMonthlyUnlifted(""); setMonthlyLifted(""); setDueDateDay("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const startDate = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
    await onAdd({
      name,
      totalValue: parseFloat(totalValue),
      durationMonths: parseInt(durationMonths),
      startDate,
      monthlyUnliftedAmount: parseFloat(monthlyUnlifted),
      monthlyLiftedAmount: monthlyLifted ? parseFloat(monthlyLifted) : undefined,
      dueDateDay: dueDateDay ? parseInt(dueDateDay) : undefined,
    });
    setLoading(false);
    reset();
  }

  const duration = parseInt(durationMonths) || 0;
  const endLabel = computeEndLabel(startMonth, startYear, duration);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Chit Fund</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">

          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Samhith Chit" required className="mt-1" />
          </div>

          <div>
            <Label className="text-xs">Pot value (₹)</Label>
            <Input type="number" value={totalValue} onChange={e => setTotalValue(e.target.value)} placeholder="e.g. 300000" required className="mt-1" />
          </div>

          <div>
            <Label className="text-xs">Duration (months)</Label>
            <Input type="number" value={durationMonths} onChange={e => setDurationMonths(e.target.value)} placeholder="e.g. 20" required className="mt-1" />
          </div>

          {/* Start month picker */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs">Start month</Label>
              {endLabel && <span className="text-[11px] text-muted-foreground">ends {endLabel}</span>}
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {MONTHS.map((m, i) => (
                <button key={m} type="button" onClick={() => setStartMonth(i + 1)}
                  className={cn("px-2 py-0.5 rounded text-xs font-medium border transition-colors",
                    startMonth === i + 1 ? "bg-zinc-900 text-white border-zinc-900" : "border-border text-muted-foreground"
                  )}>
                  {m}
                </button>
              ))}
            </div>
            <Input
              type="number"
              value={startYear}
              onChange={e => setStartYear(parseInt(e.target.value) || now.getFullYear())}
              placeholder="Year"
              min={2020}
              max={2040}
              required
            />
          </div>

          <div>
            <Label className="text-xs">Monthly contribution before lifting (₹)</Label>
            <Input type="number" value={monthlyUnlifted} onChange={e => setMonthlyUnlifted(e.target.value)} placeholder="e.g. 15000" required className="mt-1" />
          </div>

          <div>
            <Label className="text-xs">Monthly contribution after lifting (₹)</Label>
            <p className="text-[10px] text-muted-foreground mb-1">Leave blank if same as before lifting</p>
            <Input type="number" value={monthlyLifted} onChange={e => setMonthlyLifted(e.target.value)} placeholder="Optional" />
          </div>

          <div>
            <Label className="text-xs">Due date (day of month)</Label>
            <Input type="number" value={dueDateDay} onChange={e => setDueDateDay(e.target.value)} placeholder="e.g. 15" className="mt-1" />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Adding..." : "Add Chit Fund"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
