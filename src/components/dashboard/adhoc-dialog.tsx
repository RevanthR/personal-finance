"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const EXPENSE_CATEGORIES = [
  { value: "HOUSE_MAINTENANCE", label: "House" },
  { value: "LOAN",              label: "Loan" },
  { value: "CREDIT_CARD",       label: "Credit Card" },
  { value: "PERSONAL",          label: "Personal" },
  { value: "MISCELLANEOUS",     label: "Misc" },
];

const CC_SPEND_CATEGORIES = [
  "Food", "Coffee", "Groceries", "Fuel", "Shopping",
  "Travel", "Health", "Bills", "Entertainment", "Other",
];

const INCOME_SOURCES = [
  { value: "bonus",         label: "Bonus",     dbCategory: "OTHER_INCOME" },
  { value: "FREELANCE",     label: "Freelance", dbCategory: "FREELANCE" },
  { value: "reimbursement", label: "Refund",    dbCategory: "OTHER_INCOME" },
  { value: "other",         label: "Other",     dbCategory: "OTHER_INCOME" },
];

export type CCCard = { templateId: string; name: string };

export interface EditableAdHocItem {
  id: string;
  name: string;
  amount: number;
  type: string;
  category: string | null;
  customCategory: string | null;
  date: string;
  notes: string | null;
  ccTemplateId: string | null;
}

export interface AdHocSubmitFields {
  name: string; amount: number; type: string;
  category?: string; customCategory?: string; date: string; notes?: string; ccTemplateId?: string;
}

interface AdHocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: AdHocSubmitFields) => Promise<void>;
  onEdit: (id: string, item: AdHocSubmitFields) => Promise<void>;
  ccCards: CCCard[];
  customCategories: { id: string; name: string }[];
  editing?: EditableAdHocItem | null;
}

// Best-effort split of the composite "CardName · SpendCat · userNotes" string
// CC items store their sub-details in, for pre-filling an edit form.
function parseCCNotes(notes: string | null, cardName: string | undefined) {
  if (!notes) return { spendCat: "", userNotes: "" };
  let rest = notes.split(" · ");
  if (cardName && rest[0] === cardName) rest = rest.slice(1);
  const spendCat = CC_SPEND_CATEGORIES.includes(rest[0]) ? rest[0] : "";
  const userNotes = spendCat ? rest.slice(1).join(" · ") : rest.join(" · ");
  return { spendCat, userNotes };
}

export function AdHocDialog({ open, onOpenChange, onAdd, onEdit, ccCards, customCategories, editing }: AdHocDialogProps) {
  const isEditing = !!editing;
  const initialCCCard = editing?.ccTemplateId ? ccCards.find(c => c.templateId === editing.ccTemplateId) ?? null : (ccCards[0] ?? null);
  const initialParsed = editing?.category === "CREDIT_CARD" ? parseCCNotes(editing.notes, initialCCCard?.name) : null;

  const [type, setType] = useState<"INCOME" | "EXPENSE">((editing?.type as "INCOME" | "EXPENSE") ?? "EXPENSE");
  const [category, setCategory] = useState(editing?.customCategory ? "__custom__" : (editing?.category ?? ""));
  const [customLabel, setCustomLabel] = useState(editing?.customCategory ?? "");
  const [ccCard, setCCCard] = useState<CCCard | null>(initialCCCard);
  const [ccSpendCat, setCCSpendCat] = useState(initialParsed?.spendCat ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [date, setDate] = useState(editing ? editing.date.split("T")[0] : format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState(initialParsed?.userNotes ?? editing?.notes ?? "");
  const [loading, setLoading] = useState(false);

  const isCC = category === "CREDIT_CARD";
  const isCustom = category === "__custom__";

  function reset() {
    setType("EXPENSE"); setCategory(""); setCustomLabel(""); setCCCard(ccCards[0] ?? null);
    setCCSpendCat(""); setName(""); setAmount("");
    setDate(format(new Date(), "yyyy-MM-dd")); setNotes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !amount) return;
    if (isCustom && !customLabel.trim()) return;
    setLoading(true);

    const notesStr = isCC
      ? [ccCard?.name, ccSpendCat, notes].filter(Boolean).join(" · ")
      : notes || undefined;

    const resolvedCategory = type === "INCOME"
      ? (INCOME_SOURCES.find(s => s.value === category)?.dbCategory ?? undefined)
      : isCustom ? "MISCELLANEOUS" : (category || undefined);

    const fields: AdHocSubmitFields = {
      name,
      amount: parseFloat(amount),
      type,
      category: resolvedCategory,
      customCategory: isCustom ? customLabel.trim() : undefined,
      date,
      notes: notesStr || undefined,
      ccTemplateId: isCC ? (ccCard?.templateId ?? undefined) : undefined,
    };

    if (isEditing) {
      await onEdit(editing.id, fields);
    } else {
      await onAdd(fields);
      reset();
    }

    setLoading(false);
    if (!isEditing) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !isEditing) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Expense / Income toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
            {(["EXPENSE", "INCOME"] as const).map(t => (
              <button
                key={t}
                type="button"
                disabled={isEditing}
                onClick={() => { setType(t); setCategory(""); setCCSpendCat(""); }}
                className={cn(
                  "py-3 rounded-md text-sm font-semibold transition-all",
                  type === t
                    ? t === "INCOME"
                      ? "bg-positive text-white shadow-sm"
                      : "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  isEditing && "opacity-60 cursor-not-allowed"
                )}
              >
                {t === "EXPENSE" ? "Expense" : "Income"}
              </button>
            ))}
          </div>
          {isEditing && (
            <p className="text-xs text-muted-foreground -mt-2">
              Type can&apos;t be changed here — delete and re-add for that.
            </p>
          )}

          {/* Category chips */}
          <div>
            <Label className="text-xs mb-2 block">
              {type === "EXPENSE" ? "Category" : "Source"}{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {(type === "EXPENSE" ? EXPENSE_CATEGORIES : INCOME_SOURCES).map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => { setCategory(category === c.value ? "" : c.value); setCCSpendCat(""); setCustomLabel(""); }}
                  className={cn(
                    "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
                    category === c.value
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                  )}
                >
                  {c.label}
                </button>
              ))}
              {type === "EXPENSE" && customCategories.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setCategory("__custom__"); setCustomLabel(c.name); }}
                  className={cn(
                    "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
                    isCustom && customLabel === c.name
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                  )}
                >
                  {c.name}
                </button>
              ))}
              {type === "EXPENSE" && (
                <button
                  type="button"
                  onClick={() => { setCategory("__custom__"); setCCSpendCat(""); setCustomLabel(""); }}
                  className={cn(
                    "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
                    isCustom && !customLabel
                      ? "bg-foreground text-background border-foreground"
                      : "border-dashed border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                  )}
                >
                  + Custom
                </button>
              )}
            </div>
            {isCustom && (
              <Input
                className="mt-2"
                placeholder="Category name (e.g. Gifts)"
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
                autoFocus
                required={isCustom}
              />
            )}
          </div>

          {/* CC sub-options */}
          {isCC && (
            <>
              {ccCards.length >= 1 && (
                <div>
                  <Label className="text-xs mb-2 block">Which card?</Label>
                  <div className="flex flex-wrap gap-2">
                    {ccCards.map(card => (
                      <button
                        key={card.templateId}
                        type="button"
                        onClick={() => setCCCard(card)}
                        className={cn(
                          "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
                          ccCard?.templateId === card.templateId
                            ? "bg-foreground text-background border-foreground"
                            : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                        )}
                      >
                        {card.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label className="text-xs mb-2 block">
                  Spend category <span className="text-muted-foreground">(optional)</span>
                </Label>
                <div className="flex flex-wrap gap-2">
                  {CC_SPEND_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCCSpendCat(c => c === cat ? "" : cat)}
                      className={cn(
                        "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
                        ccSpendCat === cat
                          ? "bg-foreground text-background border-foreground"
                          : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <Label className="text-xs">Description</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={
                isCC ? "e.g. Zomato, Amazon, Petrol" :
                type === "INCOME" ? "e.g. Bonus, Refund" :
                "e.g. Plumber, Birthday gift"
              }
              autoFocus
              required
            />
          </div>

          <div>
            <Label className="text-xs">Amount (₹)</Label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              required
            />
          </div>

          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {!isCC && (
            <div>
              <Label className="text-xs">Notes <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes..." />
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading || !name || !amount} className="w-full">
              {loading ? "Saving..." : isEditing ? "Save Changes" : type === "INCOME" ? "Add Income" : "Add Expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
