"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";

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

export function AddChitDialog({ open, onOpenChange, onAdd }: AddChitDialogProps) {
  const [f, setF] = useState({
    name: "", totalValue: "", durationMonths: "", startDate: format(new Date(), "yyyy-MM-dd"),
    monthlyUnliftedAmount: "", monthlyLiftedAmount: "", dueDateDay: "",
  });
  const [loading, setLoading] = useState(false);

  function upd(k: string, v: string) { setF((p) => ({ ...p, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onAdd({
      name: f.name,
      totalValue: parseFloat(f.totalValue),
      durationMonths: parseInt(f.durationMonths),
      startDate: f.startDate,
      monthlyUnliftedAmount: parseFloat(f.monthlyUnliftedAmount),
      monthlyLiftedAmount: f.monthlyLiftedAmount ? parseFloat(f.monthlyLiftedAmount) : undefined,
      dueDateDay: f.dueDateDay ? parseInt(f.dueDateDay) : undefined,
    });
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Chit Fund</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {[
            { label: "Name", key: "name", type: "text", placeholder: "e.g. Samhith Chit" },
            { label: "Total Value (₹)", key: "totalValue", type: "number", placeholder: "e.g. 300000" },
            { label: "Duration (months)", key: "durationMonths", type: "number", placeholder: "e.g. 20" },
            { label: "Start Date", key: "startDate", type: "date" },
            { label: "Monthly Amount (unlifted ₹)", key: "monthlyUnliftedAmount", type: "number", placeholder: "e.g. 15000" },
            { label: "Monthly Amount (lifted ₹)", key: "monthlyLiftedAmount", type: "number", placeholder: "Optional — if lifted" },
            { label: "Due Date (day of month)", key: "dueDateDay", type: "number", placeholder: "e.g. 15" },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <Label className="text-xs">{label}</Label>
              <Input
                type={type}
                value={(f as Record<string, string>)[key]}
                onChange={(e) => upd(key, e.target.value)}
                placeholder={placeholder}
                required={["name", "totalValue", "durationMonths", "startDate", "monthlyUnliftedAmount"].includes(key)}
              />
            </div>
          ))}
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
