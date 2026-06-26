"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";

interface MarkReceivedDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  receivable: {
    id: string;
    description: string;
    expectedAmount: number;
  };
  onConfirm: (data: {
    receivedAmount: number;
    receivedMonth: number;
    receivedYear: number;
    receivedDate: string;
  }) => Promise<void>;
}

export function MarkReceivedDialog({ open, onOpenChange, receivable, onConfirm }: MarkReceivedDialogProps) {
  const now = new Date();
  const [receivedAmount, setReceivedAmount] = useState(String(receivable.expectedAmount));
  const [receivedMonth, setReceivedMonth] = useState(String(now.getMonth() + 1));
  const [receivedYear, setReceivedYear] = useState(String(now.getFullYear()));
  const [receivedDate, setReceivedDate] = useState(now.toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onConfirm({
      receivedAmount: parseFloat(receivedAmount),
      receivedMonth: parseInt(receivedMonth),
      receivedYear: parseInt(receivedYear),
      receivedDate,
    });
    setLoading(false);
  }

  const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as Received</DialogTitle>
          <DialogDescription>
            {receivable.description} · Expected {formatCurrency(receivable.expectedAmount)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-xs">Amount Received (₹)</Label>
            <Input
              type="number"
              value={receivedAmount}
              onChange={(e) => setReceivedAmount(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Month</Label>
              <select
                value={receivedMonth}
                onChange={(e) => setReceivedMonth(e.target.value)}
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
                value={receivedYear}
                onChange={(e) => setReceivedYear(e.target.value)}
                min="2020"
                max="2040"
                required
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Date Received</Label>
            <Input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700">
              {loading ? "Saving..." : "Mark as Received"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
