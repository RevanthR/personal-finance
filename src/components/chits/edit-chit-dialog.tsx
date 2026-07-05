"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, MONTHS } from "@/lib/utils";

type ChitForEdit = {
  id: string;
  totalValue: number;
  liftedAmount: number | null;
  durationMonths: number;
  startDate: string;
  monthlyUnliftedAmount: number;
  monthlyLiftedAmount: number | null;
  isLifted: boolean;
  liftedOn: string | null;
  template: { name: string; dueDateDay: number | null };
};

interface EditChitDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chit: ChitForEdit;
  onSave: (chitId: string, data: Record<string, unknown>) => Promise<void>;
}

function endLabel(startMonth: number, startYear: number, duration: number): string {
  if (!startMonth || !startYear || !duration) return "";
  const totalMonths = startMonth - 1 + duration - 1;
  return `${MONTHS[totalMonths % 12]} ${startYear + Math.floor(totalMonths / 12)}`;
}

export function EditChitDialog({ open, onOpenChange, chit, onSave }: EditChitDialogProps) {
  const sd = new Date(chit.startDate);
  const ld = chit.liftedOn ? new Date(chit.liftedOn) : null;

  const [name, setName]             = useState(chit.template.name);
  const [totalValue, setTotalValue] = useState(String(chit.totalValue));
  const [duration, setDuration]     = useState(String(chit.durationMonths));
  const [startMonth, setStartMonth] = useState(sd.getUTCMonth() + 1);
  const [startYear, setStartYear]   = useState(sd.getUTCFullYear());
  const [preAmt, setPreAmt]         = useState(String(chit.monthlyUnliftedAmount));
  const [postAmt, setPostAmt]       = useState(String(chit.monthlyLiftedAmount ?? ""));
  const [liftedAmt, setLiftedAmt]  = useState(String(chit.liftedAmount ?? chit.totalValue));
  const [dueDay, setDueDay]         = useState(String(chit.template.dueDateDay ?? ""));
  const [liftMonth, setLiftMonth]   = useState(String(ld ? ld.getUTCMonth() + 1 : ""));
  const [liftYear, setLiftYear]     = useState(String(ld ? ld.getUTCFullYear() : ""));
  const [loading, setLoading]       = useState(false);

  const el = endLabel(startMonth, startYear, parseInt(duration) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const startDateStr = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
    const patch: Record<string, unknown> = {
      name,
      totalValue: parseFloat(totalValue),
      durationMonths: parseInt(duration),
      startDate: startDateStr,
      monthlyUnliftedAmount: parseFloat(preAmt),
      dueDateDay: dueDay ? parseInt(dueDay) : null,
    };
    if (postAmt) patch.monthlyLiftedAmount = parseFloat(postAmt);
    if (chit.isLifted && liftedAmt) patch.liftedAmount = parseFloat(liftedAmt);
    if (chit.isLifted && liftMonth && liftYear) {
      patch.liftMonth = parseInt(liftMonth);
      patch.liftYear  = parseInt(liftYear);
    }
    await onSave(chit.id, patch);
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Chit</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required className="mt-1" />
          </div>

          <div>
            <Label className="text-xs">Pot value (₹)</Label>
            <Input type="number" value={totalValue} onChange={e => setTotalValue(e.target.value)} required className="mt-1" />
          </div>

          {chit.isLifted && (
            <div>
              <Label className="text-xs">Pot received (₹)</Label>
              <p className="text-xs text-muted-foreground mb-1">Amount actually received when lifted</p>
              <Input type="number" value={liftedAmt} onChange={e => setLiftedAmt(e.target.value)} />
            </div>
          )}

          <div>
            <Label className="text-xs">Duration (months)</Label>
            <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} required className="mt-1" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs">Start month</Label>
              {el && <span className="text-xs text-muted-foreground">ends {el}</span>}
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {MONTHS.map((m, i) => (
                <button key={m} type="button" onClick={() => setStartMonth(i + 1)}
                  className={cn("px-2 py-0.5 rounded text-xs font-medium border transition-colors",
                    startMonth === i + 1
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "border-border text-muted-foreground"
                  )}>
                  {m}
                </button>
              ))}
            </div>
            <Input type="number" value={startYear}
              onChange={e => setStartYear(parseInt(e.target.value) || new Date().getFullYear())}
              placeholder="Year" min={2020} max={2040} required />
          </div>

          <div>
            <Label className="text-xs">Monthly payment before lifting (₹)</Label>
            <Input type="number" value={preAmt} onChange={e => setPreAmt(e.target.value)} required className="mt-1" />
          </div>

          <div>
            <Label className="text-xs">Monthly payment after lifting (₹)</Label>
            <p className="text-xs text-muted-foreground mb-1">Leave blank if same as before</p>
            <Input type="number" value={postAmt} onChange={e => setPostAmt(e.target.value)} placeholder="Optional" />
          </div>

          <div>
            <Label className="text-xs">Due date (day of month)</Label>
            <Input type="number" value={dueDay} onChange={e => setDueDay(e.target.value)} placeholder="e.g. 15" className="mt-1" />
          </div>

          {chit.isLifted && (
            <div>
              <Label className="text-xs">Lifted in</Label>
              <div className="flex gap-2 mt-1">
                <select value={liftMonth} onChange={e => setLiftMonth(e.target.value)}
                  className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  {MONTHS.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
                <Input type="number" value={liftYear} onChange={e => setLiftYear(e.target.value)}
                  min="2020" max="2040" className="w-24" />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
