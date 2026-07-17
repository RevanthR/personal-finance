"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/ui/chip";
import { cn, EXPENSE_CATEGORY_CHIPS, SPEND_SUBCATEGORIES } from "@/lib/utils";
import { format } from "date-fns";

const EXPENSE_CATEGORIES = EXPENSE_CATEGORY_CHIPS;

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
// pre-revamp CC entries stored their sub-details in — only needed to prefill
// the edit form for rows created before category/sub-category became real
// fields. New entries never write this packed format.
function parseCCNotes(notes: string | null, cardName: string | undefined) {
  if (!notes) return { spendCat: "", userNotes: "" };
  let rest = notes.split(" · ");
  if (cardName && rest[0] === cardName) rest = rest.slice(1);
  const spendCat = (SPEND_SUBCATEGORIES as readonly string[]).includes(rest[0]) ? rest[0] : "";
  const userNotes = spendCat ? rest.slice(1).join(" · ") : rest.join(" · ");
  return { spendCat, userNotes };
}

type WizardStep = "basics" | "category" | "subcategory" | "payment" | "notes";
const WIZARD_STEPS: WizardStep[] = ["basics", "category", "subcategory", "payment", "notes"];

export function AdHocDialog({ open, onOpenChange, onAdd, onEdit, ccCards, customCategories, editing }: AdHocDialogProps) {
  const isEditing = !!editing;
  const initialCCCard = editing?.ccTemplateId ? ccCards.find(c => c.templateId === editing.ccTemplateId) ?? null : null;
  // Pre-revamp CC rows have no customCategory yet — their sub-label lives
  // packed inside notes instead. Detect that shape once, up front, so both
  // the edit form's initial state and the eventual "upgrade on save" are simple.
  const isOldStyleCC = !!editing?.ccTemplateId && !editing?.customCategory && !!editing?.notes;
  const initialParsed = isOldStyleCC ? parseCCNotes(editing!.notes, initialCCCard?.name) : null;

  const [type, setType] = useState<"INCOME" | "EXPENSE">((editing?.type as "INCOME" | "EXPENSE") ?? "EXPENSE");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [customLabel, setCustomLabel] = useState(editing?.customCategory ?? initialParsed?.spendCat ?? "");
  const [showNewSubcat, setShowNewSubcat] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">(editing?.ccTemplateId ? "CARD" : "CASH");
  const [ccCard, setCCCard] = useState<CCCard | null>(initialCCCard ?? (ccCards[0] ?? null));
  const [name, setName] = useState(editing?.name ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [date, setDate] = useState(editing ? editing.date.split("T")[0] : format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState(isOldStyleCC ? (initialParsed?.userNotes ?? "") : (editing?.notes ?? ""));
  const [loading, setLoading] = useState(false);

  // The step wizard only applies to *adding* a new expense — editing stays a
  // single scrolling screen (all fields visible, pre-filled), and income has
  // no payment-method/category tree to walk at all.
  const useWizard = !isEditing && type === "EXPENSE";
  const [step, setStep] = useState<WizardStep>("basics");

  function goNext() {
    const i = WIZARD_STEPS.indexOf(step);
    if (i < WIZARD_STEPS.length - 1) setStep(WIZARD_STEPS[i + 1]);
  }
  function goBack() {
    const i = WIZARD_STEPS.indexOf(step);
    if (i > 0) setStep(WIZARD_STEPS[i - 1]);
  }

  function reset() {
    setType("EXPENSE"); setCategory(""); setCustomLabel(""); setShowNewSubcat(false);
    setPaymentMethod("CASH"); setCCCard(ccCards[0] ?? null);
    setName(""); setAmount(""); setDate(format(new Date(), "yyyy-MM-dd")); setNotes("");
    setStep("basics");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !amount) return;
    setLoading(true);

    const resolvedCategory = type === "INCOME"
      ? (INCOME_SOURCES.find(s => s.value === category)?.dbCategory ?? undefined)
      : (category || undefined);

    const fields: AdHocSubmitFields = {
      name,
      amount: parseFloat(amount),
      type,
      category: resolvedCategory,
      customCategory: type === "EXPENSE" ? (customLabel.trim() || undefined) : undefined,
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

  const subcatSuggestions = [...new Set([...customCategories.map(c => c.name), ...SPEND_SUBCATEGORIES])];
  const canSubmit = !loading && !!name && !!amount;

  // ── Wizard steps (adding an expense only) ──────────────────────────────
  function renderWizardStep() {
    switch (step) {
      case "basics":
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" autoFocus required />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <Button type="button" className="w-full" disabled={!amount} onClick={goNext}>Continue</Button>
          </div>
        );

      case "category":
        return (
          <div className="space-y-3">
            <Label className="text-xs block">Category</Label>
            <div className="flex flex-wrap gap-2">
              {EXPENSE_CATEGORIES.map(c => (
                <Chip key={c.value} label={c.label} active={category === c.value} onClick={() => setCategory(c.value)} />
              ))}
            </div>
            <Button type="button" className="w-full" disabled={!category} onClick={goNext}>Continue</Button>
          </div>
        );

      case "subcategory":
        return (
          <div className="space-y-3">
            <Label className="text-xs block">
              Sub-category <span className="text-muted-foreground">(optional)</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {subcatSuggestions.map(name => (
                <Chip key={name} label={name} active={customLabel === name && !showNewSubcat} onClick={() => { setCustomLabel(c => c === name ? "" : name); setShowNewSubcat(false); }} />
              ))}
              <Chip label="+ Add new" dashed active={showNewSubcat} onClick={() => { setShowNewSubcat(true); setCustomLabel(""); }} />
            </div>
            {showNewSubcat && (
              <Input
                placeholder="Sub-category name (e.g. Coffee)"
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
                autoFocus
              />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setCustomLabel(""); setShowNewSubcat(false); goNext(); }}>Skip</Button>
              <Button type="button" className="flex-1" disabled={!customLabel.trim()} onClick={goNext}>Continue</Button>
            </div>
          </div>
        );

      case "payment": {
        const canContinue = paymentMethod === "CASH" || (paymentMethod === "CARD" && (ccCards.length === 0 || !!ccCard));
        return (
          <div className="space-y-3">
            <Label className="text-xs block">Paid via</Label>
            <div className="flex flex-wrap gap-2">
              <Chip label="Cash/UPI" active={paymentMethod === "CASH"} onClick={() => setPaymentMethod("CASH")} />
              <Chip label="Card" active={paymentMethod === "CARD"} onClick={() => { setPaymentMethod("CARD"); if (!ccCard) setCCCard(ccCards[0] ?? null); }} />
            </div>
            {paymentMethod === "CARD" && ccCards.length > 0 && (
              <>
                <Label className="text-xs block mt-1">Which card?</Label>
                <div className="flex flex-wrap gap-2">
                  {ccCards.map(card => (
                    <Chip key={card.templateId} label={card.name} active={ccCard?.templateId === card.templateId} onClick={() => setCCCard(card)} />
                  ))}
                </div>
              </>
            )}
            <Button type="button" className="w-full" disabled={!canContinue} onClick={goNext}>Continue</Button>
          </div>
        );
      }

      case "notes":
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Notes</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={customLabel || EXPENSE_CATEGORIES.find(c => c.value === category)?.label || "e.g. Zomato, Plumber, Petrol"}
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!canSubmit} className="w-full">
                {loading ? "Saving..." : "Add Expense"}
              </Button>
            </DialogFooter>
          </div>
        );
    }
  }

  // Breadcrumb of picks made so far, tappable to jump back and revise.
  const crumbs: { label: string; step: WizardStep }[] = [];
  if (amount) crumbs.push({ label: `₹${amount}`, step: "basics" });
  if (category) crumbs.push({ label: EXPENSE_CATEGORIES.find(c => c.value === category)?.label ?? category, step: "category" });
  if (step !== "basics" && step !== "category") {
    crumbs.push({ label: customLabel || "No sub-category", step: "subcategory" });
  }
  if (step === "notes") {
    crumbs.push({ label: paymentMethod === "CARD" ? (ccCard?.name ?? "Card") : "Cash/UPI", step: "payment" });
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
                onClick={() => { setType(t); setCategory(""); setStep("basics"); }}
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

          {useWizard ? (
            <>
              {crumbs.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground -mt-1">
                  {crumbs.map((c, i) => (
                    <span key={c.step} className="flex items-center gap-1">
                      {i > 0 && <span>→</span>}
                      <button type="button" onClick={() => setStep(c.step)} className="hover:text-foreground hover:underline">
                        {c.label}
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {renderWizardStep()}
              {step !== "basics" && (
                <Button type="button" variant="outline" className="w-full" onClick={goBack}>
                  ← Back
                </Button>
              )}
            </>
          ) : (
            <>
              {/* Category chips */}
              <div>
                <Label className="text-xs mb-2 block">
                  {type === "EXPENSE" ? "Category" : "Source"}{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <div className="flex flex-wrap gap-2">
                  {(type === "EXPENSE" ? EXPENSE_CATEGORIES : INCOME_SOURCES).map(c => (
                    <Chip key={c.value} label={c.label} active={category === c.value} onClick={() => setCategory(category === c.value ? "" : c.value)} />
                  ))}
                </div>
              </div>

              {type === "EXPENSE" && (
                <>
                  {/* Sub-category chips */}
                  <div>
                    <Label className="text-xs mb-2 block">
                      Sub-category <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {subcatSuggestions.map(n => (
                        <Chip key={n} label={n} active={customLabel === n && !showNewSubcat} onClick={() => { setCustomLabel(c => c === n ? "" : n); setShowNewSubcat(false); }} />
                      ))}
                      <Chip label="+ Add new" dashed active={showNewSubcat} onClick={() => { setShowNewSubcat(v => !v); if (!showNewSubcat) setCustomLabel(""); }} />
                    </div>
                    {showNewSubcat && (
                      <Input
                        className="mt-2"
                        placeholder="Sub-category name (e.g. Coffee)"
                        value={customLabel}
                        onChange={e => setCustomLabel(e.target.value)}
                        autoFocus
                      />
                    )}
                  </div>

                  {/* Payment method */}
                  <div>
                    <Label className="text-xs mb-2 block">Paid via</Label>
                    <div className="flex flex-wrap gap-2">
                      <Chip label="Cash/UPI" active={paymentMethod === "CASH"} onClick={() => setPaymentMethod("CASH")} />
                      <Chip label="Card" active={paymentMethod === "CARD"} onClick={() => setPaymentMethod("CARD")} />
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
                <Label className="text-xs">Amount (₹)</Label>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" required />
              </div>

              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
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
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
