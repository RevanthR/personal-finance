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
import { cn, EXPENSE_CATEGORY_CHIPS, getCategoryColor, getCategoryIcon, getSubCategoryIcon } from "@/lib/utils";
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
  const [category, setCategory] = useState(editing?.category ?? "");
  // A user-created top-level category (e.g. "Kids") — mutually exclusive
  // with `category`; selecting one clears the other.
  const [customCategoryName, setCustomCategoryName] = useState(editing?.customCategory ?? "");
  const [subLabel, setSubLabel] = useState(editing?.subCategory ?? "");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewSubcat, setShowNewSubcat] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">(editing?.ccTemplateId ? "CARD" : "CASH");
  const [ccCard, setCCCard] = useState<CCCard | null>(initialCCCard ?? (ccCards[0] ?? null));
  const [name, setName] = useState(editing?.name ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [date, setDate] = useState(editing ? editing.date.split("T")[0] : format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [loading, setLoading] = useState(false);

  function handleIncomeSourceSelect(value: string) {
    setCategory(value);
  }

  function selectBuiltInCategory(value: string) {
    setCategory(value); setCustomCategoryName(""); setShowNewCategory(false);
    setSubLabel(""); setShowNewSubcat(false);
  }
  function selectCustomCategory(name: string) {
    setCustomCategoryName(name); setCategory(""); setShowNewCategory(false);
    setSubLabel(""); setShowNewSubcat(false);
  }
  function selectSubCategory(value: string) {
    setSubLabel(value); setShowNewSubcat(false);
  }

  function reset() {
    setType("EXPENSE"); setCategory(""); setCustomCategoryName(""); setShowNewCategory(false);
    setSubLabel(""); setShowNewSubcat(false);
    setPaymentMethod("CASH"); setCCCard(ccCards[0] ?? null);
    setName(""); setAmount(""); setDate(format(new Date(), "yyyy-MM-dd")); setNotes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !amount || (!category && !customCategoryName.trim())) return;
    setLoading(true);

    const resolvedCategory = type === "INCOME"
      ? (INCOME_SOURCES.find(s => s.value === category)?.dbCategory ?? undefined)
      : (category || undefined);

    const fields: AdHocSubmitFields = {
      name,
      amount: parseFloat(amount),
      type,
      category: resolvedCategory,
      customCategory: type === "EXPENSE" ? (customCategoryName.trim() || undefined) : undefined,
      subCategory: type === "EXPENSE" ? (subLabel.trim() || undefined) : undefined,
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

  const hasCategory = !!category || !!customCategoryName.trim();
  const canSubmit = !loading && !!name && !!amount && hasCategory;

  // Sub-category chips scoped to whichever category is currently selected
  // — purely real past usage, not a generic seed list. "Other" is always
  // offered first as the stable default bucket (same convention as
  // daily-spends-section.tsx's grouping fallback).
  const selectedCustomCategoryId = customCategoryName
    ? customCategories.find(c => c.name.toLowerCase() === customCategoryName.trim().toLowerCase())?.id ?? null
    : null;
  const scopedPastSubcats = subCategorySuggestions
    .filter(s => customCategoryName ? s.customCategoryId === selectedCustomCategoryId : (s.category === category && !s.customCategoryId))
    .map(s => s.subCategory)
    .filter((s): s is string => !!s && s.toLowerCase() !== "other");
  const subcatChips = ["Other", ...new Set(scopedPastSubcats)];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !isEditing) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm sm:max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">

          {/* Expense / Income toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
            {(["EXPENSE", "INCOME"] as const).map(t => (
              <button
                key={t}
                type="button"
                disabled={isEditing}
                onClick={() => { setType(t); setCategory(""); setCustomCategoryName(""); setSubLabel(""); }}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" required />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {type === "EXPENSE" ? (
            <>
              {/* Category — single-tap chips, same interaction as Paid via
                  below. Picking one immediately reveals its sub-category
                  row (see below) instead of opening a separate screen. */}
              <div>
                <Label className="text-xs mb-2 block">Category</Label>
                <div className="flex flex-wrap gap-2">
                  {EXPENSE_CATEGORY_CHIPS.map(c => (
                    <Chip
                      key={c.value}
                      label={c.label}
                      icon={getCategoryIcon(c.value)}
                      color={getCategoryColor(c.value)}
                      active={category === c.value}
                      onClick={() => selectBuiltInCategory(c.value)}
                    />
                  ))}
                  {customCategories.map(c => (
                    <Chip
                      key={c.id}
                      label={c.name}
                      icon={getCategoryIcon("MISCELLANEOUS", c.name)}
                      color={getCategoryColor("MISCELLANEOUS", c.name)}
                      active={customCategoryName === c.name}
                      onClick={() => selectCustomCategory(c.name)}
                    />
                  ))}
                  <Chip label="+ New" dashed active={showNewCategory} onClick={() => setShowNewCategory(v => !v)} />
                </div>
                {showNewCategory && (
                  <Input
                    className="mt-2"
                    placeholder="Category name (e.g. Kids)"
                    value={customCategoryName}
                    onChange={e => setCustomCategoryName(e.target.value)}
                    autoFocus
                  />
                )}
              </div>

              {hasCategory && (
                <div>
                  <Label className="text-xs mb-2 block">Sub-category</Label>
                  <div className="flex flex-wrap gap-2">
                    {subcatChips.map(name => (
                      <Chip
                        key={name}
                        label={name}
                        icon={getSubCategoryIcon(name)}
                        color={getCategoryColor(category, customCategoryName || null)}
                        active={subLabel === name}
                        onClick={() => selectSubCategory(name)}
                      />
                    ))}
                    <Chip label="+ New" dashed active={showNewSubcat} onClick={() => setShowNewSubcat(v => !v)} />
                  </div>
                  {showNewSubcat && (
                    <Input
                      className="mt-2"
                      placeholder="Sub-category name (e.g. Coffee)"
                      value={subLabel}
                      onChange={e => setSubLabel(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
              )}

              {/* Payment method — small, fixed option counts, chips suit these better than a dropdown */}
              <div>
                <Label className="text-xs mb-2 block">Paid via</Label>
                <div className="flex flex-wrap gap-2">
                  <Chip label="Cash/UPI" icon={Wallet} active={paymentMethod === "CASH"} onClick={() => setPaymentMethod("CASH")} />
                  <Chip label="Card" icon={CreditCard} active={paymentMethod === "CARD"} onClick={() => setPaymentMethod("CARD")} />
                </div>
                {paymentMethod === "CARD" && ccCards.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
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
              <Select value={category} onChange={e => handleIncomeSourceSelect(e.target.value)} required>
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
