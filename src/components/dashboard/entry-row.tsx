"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/utils";
import { Clock, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface EntryRowProps {
  entry: {
    id: string;
    amount: number;
    isPaid: boolean;
    paidOn: string | null;
    notes: string | null;
    template: {
      name: string;
      category: string;
      isFixed: boolean;
      dueDateDay: number | null;
      chitFund: { isLifted: boolean; accumulatedSavings: number } | null;
    };
  };
  onUpdate: (id: string, updates: { isPaid?: boolean; amount?: number; notes?: string }) => Promise<void>;
}

export function EntryRow({ entry, onUpdate }: EntryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [editAmount, setEditAmount] = useState(String(entry.amount));
  const [editNotes, setEditNotes] = useState(entry.notes ?? "");
  const [saving, setSaving] = useState(false);

  const color = CATEGORY_COLORS[entry.template.category] ?? "#6b7280";
  const isChitInvestment = entry.template.category === "CHIT_FUND" && !entry.template.chitFund?.isLifted;

  async function togglePaid() {
    await onUpdate(entry.id, { isPaid: !entry.isPaid });
  }

  async function saveEdit() {
    setSaving(true);
    await onUpdate(entry.id, {
      amount: parseFloat(editAmount) || entry.amount,
      notes: editNotes || undefined,
    });
    setSaving(false);
    setExpanded(false);
  }

  return (
    <div className={`rounded-lg border bg-card transition-all ${entry.isPaid ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3 p-3">
        <Checkbox
          checked={entry.isPaid}
          onCheckedChange={togglePaid}
          className="shrink-0"
        />
        <div
          className="w-1 h-8 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${entry.isPaid ? "line-through text-muted-foreground" : ""}`}>
              {entry.template.name}
            </span>
            {isChitInvestment && (
              <Badge variant="secondary" className="text-xs py-0">
                Investment
              </Badge>
            )}
            {entry.template.chitFund?.isLifted && (
              <Badge variant="destructive" className="text-xs py-0">
                Lifted
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {CATEGORY_LABELS[entry.template.category] ?? entry.template.category}
            </span>
            {entry.template.dueDateDay && !entry.isPaid && (
              <span className="text-xs flex items-center gap-0.5 text-amber-600">
                <Clock className="w-3 h-3" />
                Due {entry.template.dueDateDay}th
              </span>
            )}
            {entry.isPaid && entry.paidOn && (
              <span className="text-xs text-emerald-600">
                Paid {format(new Date(entry.paidOn), "dd MMM")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold">{formatCurrency(entry.amount)}</span>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-3 py-3 space-y-3">
          {!entry.template.isFixed && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Amount</label>
              <Input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
            <Input
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Add a note..."
              className="h-8 text-sm"
            />
          </div>
          <Button size="sm" onClick={saveEdit} disabled={saving} className="w-full">
            <Pencil className="w-3 h-3 mr-1" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
