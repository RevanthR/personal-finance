"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";

interface ForecloseDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: { id: string; name: string; amount: number };
  onForeclose: (data: {
    foreClosedOn: string;
    foreCloseAmount: number;
    note: string;
    addToCurrentMonth: boolean;
  }) => Promise<void>;
}

export function ForecloseDialog({ open, onOpenChange, template, onForeclose }: ForecloseDialogProps) {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [amount, setAmount] = useState(String(template.amount));
  const [note, setNote] = useState("");
  const [addToMonth, setAddToMonth] = useState(true);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onForeclose({
      foreClosedOn: new Date(date).toISOString(),
      foreCloseAmount: parseFloat(amount) || 0,
      note,
      addToCurrentMonth: addToMonth,
    });
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Foreclose — {template.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
            This will stop this expense from appearing in future months and mark it as closed.
          </div>

          <div>
            <Label className="text-xs">Settlement Amount (₹)</Label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={String(template.amount)}
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">
              Regular EMI was {formatCurrency(template.amount)}/month
            </p>
          </div>

          <div>
            <Label className="text-xs">Foreclosure Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>

          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Paid off ISB loan early"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Add to this month&apos;s expenses</p>
              <p className="text-xs text-muted-foreground">
                Records the settlement as a one-off expense
              </p>
            </div>
            <Switch checked={addToMonth} onCheckedChange={setAddToMonth} />
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !amount}
              variant="destructive"
            >
              {loading ? "Closing..." : "Foreclose"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
