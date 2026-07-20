"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Chip } from "@/components/ui/chip";
import { CategoryChipPicker } from "@/components/shared/category-chip-picker";
import { useCategoryPicker } from "@/hooks/use-category-picker";
import { cn } from "@/lib/utils";
import { Wallet, CreditCard } from "lucide-react";
import { format } from "date-fns";

const INCOME_SOURCES = [
  { value: "bonus",         label: "Bonus",     dbCategory: "OTHER_INCOME" },
  { value: "FREELANCE",     label: "Freelance", dbCategory: "FREELANCE" },
  { value: "reimbursement", label: "Refund",    dbCategory: "OTHER_INCOME" },
  { value: "other",         label: "Other",     dbCategory: "OTHER_INCOME" },
];

export type CCCard = { templateId: string; name: string };
export type SubCategorySuggestion = { category: string | null; customCategoryId: string | null; subCategory: string | null };

export interface EditableAdHocItem {
  id: string;
  name: string;
  amount: number;
  type: string;
  category: string | null;
  customCategory: string | null;
  subCategory: string | null;
  date: string;
  notes: string | null;
  ccTemplateId: string | null;
}

export interface AdHocSubmitFields {
  name: string; amount: number; type: string;
  category?: string; customCategory?: string; subCategory?: string; date: string; notes?: string; ccTemplateId?: string;
}

interface AdHocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: AdHocSubmitFields) => Promise<void>;
  onEdit: (id: string, item: AdHocSubmitFields) => Promise<void>;
  ccCards: CCCard[];
  customCategories: { id: string; name: string }[];
  subCategorySuggestions: SubCategorySuggestion[];
  editing?: EditableAdHocItem | null;
}

export function AdHocDialog({ open, onOpenChange, onAdd, onEdit, ccCards, customCategories, subCategorySuggestions, editing }: AdHocDialogProps) {
  const isEditing = !!editing;
  const initialCCCard = editing?.ccTemplateId ? ccCards.find(c => c.templateId === editing.ccTemplateId) ?? null : null;

  const [type, setType] = useState<"INCOME" | "EXPENSE">((editing?.type as "INCOME" | "EXPENSE") ?? "EXPENSE");
  const picker = useCategoryPicker({
    initialCategory: editing?.category ?? "",
    initialCustomCategory: editing?.customCategory ?? "",
    initialSubCategory: editing?.subCategory ?? "",
    customCategories,
    subCategorySuggestions,
  });
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">(editing?.ccTemplateId ? "CARD" : "CASH");
  const [ccCard, setCCCard] = useState<CCCard | null>(initialCCCard ?? (ccCards[0] ?? null));
  const [name, setName] = useState(editing?.name ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [date, setDate] = useState(editing ? editing.date.split("T")[0] : format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [loading, setLoading] = useState(false);

  function reset() {
    setType("EXPENSE"); picker.reset();
    setPaymentMethod("CASH"); setCCCard(ccCards[0] ?? null);
    setName(""); setAmount(""); setDate(format(new Date(), "yyyy-MM-dd")); setNotes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !amount || !picker.hasCategory) return;
    setLoading(true);

    const resolvedCategory = type === "INCOME"
      ? (INCOME_SOURCES.find(s => s.value === picker.category)?.dbCategory ?? undefined)
      : (picker.category || undefined);

    const fields: AdHocSubmitFields = {
      name,
      amount: parseFloat(amount),
      type,
      category: resolvedCategory,
      customCategory: type === "EXPENSE" ? (picker.customCategoryName.trim() || undefined) : undefined,
      subCategory: type === "EXPENSE" ? (picker.subLabel.trim() || undefined) : undefined,
      date,
      notes: notes || undefined,
      ccTemplateId: type !== "EXPENSE"
        ? undefined
        : paymentMethod === "CARD"
          ? (ccCard?.templateId ?? undefined)
          // Editing needs an explicit "" to clear a previously-set card;
          // adding just omits the field so POST stores a clean null.
          : (isEditing ? "" : undefined),
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

  const canSubmit = !loading && !!name && !!amount && picker.hasCategory;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !isEditing) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm sm:max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-2.5">

          {/* Expense / Income toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
            {(["EXPENSE", "INCOME"] as const).map(t => (
              <button
                key={t}
                type="button"
                disabled={isEditing}
                onClick={() => { setType(t); picker.reset(); }}
                className={cn(
                  "py-2 rounded-md text-sm font-semibold transition-all",
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
              Type can&apos;t be changed here, delete and re-add for that.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" required />
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {type === "EXPENSE" ? (
            <>
              <CategoryChipPicker picker={picker} customCategories={customCategories} />

              {/* Payment method — small, fixed option counts, chips suit these better than a dropdown */}
              <div>
                <Label className="text-xs mb-2 block">Paid via</Label>
                <div className="flex flex-wrap gap-1.5">
                  <Chip label="Cash/UPI" icon={Wallet} active={paymentMethod === "CASH"} onClick={() => setPaymentMethod("CASH")} />
                  <Chip label="Card" icon={CreditCard} active={paymentMethod === "CARD"} onClick={() => setPaymentMethod("CARD")} />
                </div>
                {paymentMethod === "CARD" && ccCards.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {ccCards.map(card => (
                      <Chip key={card.templateId} label={card.name} active={ccCard?.templateId === card.templateId} onClick={() => setCCCard(card)} />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div>
              <Label className="text-xs">Source</Label>
              <Select value={picker.category} onChange={e => picker.setCategory(e.target.value)} required>
                <option value="">Select...</option>
                {INCOME_SOURCES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">Description</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={type === "INCOME" ? "e.g. Bonus, Refund" : "e.g. Plumber, Birthday gift"}
              required
            />
          </div>

          <div>
            <Label className="text-xs">Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes..." />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!canSubmit} className="w-full">
              {loading ? "Saving..." : isEditing ? "Save Changes" : type === "INCOME" ? "Add Income" : "Add Expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
