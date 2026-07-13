"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency, cn, MONTHS } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { Plus, TrendingUp, TrendingDown, Wallet, Clock, CheckCircle2, Trash2, CreditCard, Pencil, AlertCircle } from "lucide-react";
import { PageCoach } from "@/components/coach/page-coach";
import { toast } from "sonner";
import { format } from "date-fns";

const AddChitDialog       = dynamic(() => import("@/components/chits/add-chit-dialog").then(m => m.AddChitDialog), { ssr: false });
const LiftChitDialog      = dynamic(() => import("@/components/chits/lift-chit-dialog").then(m => m.LiftChitDialog), { ssr: false });
const EditChitDialog      = dynamic(() => import("@/components/chits/edit-chit-dialog").then(m => m.EditChitDialog), { ssr: false });
const AddReceivableDialog = dynamic(() => import("./add-receivable-dialog").then(m => m.AddReceivableDialog), { ssr: false });
const MarkReceivedDialog  = dynamic(() => import("./mark-received-dialog").then(m => m.MarkReceivedDialog), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

type CCEntry = {
  id: string; templateId: string;
  amount: number; billedAmount: number | null;
  isPaid: boolean; paidAmount: number | null; cashbackAmount: number | null;
  statementAmount: number | null;
};

type CCCard = {
  id: string; bank: string | null; network: string | null; last4: string | null;
  template: { id: string; name: string; isActive: boolean; statementDay: number | null; dueDateDay: number | null };
  currentEntry: CCEntry | null;
};

type Chit = {
  id: string; totalValue: number; durationMonths: number; startDate: string;
  monthlyUnliftedAmount: number; monthlyLiftedAmount: number | null;
  isLifted: boolean; liftedOn: string | null; liftedAmount: number | null;
  liftedUsedFor: string | null; accumulatedSavings: number; endDate: string | null;
  template: { id: string; name: string; isActive: boolean; dueDateDay: number | null };
};

type Receivable = {
  id: string;
  category: "INVESTMENT" | "PERSONAL_LOAN" | "CUSTOM";
  customCategory: string | null; description: string;
  expectedAmount: number; expectedDate: string | null;
  status: "PENDING" | "RECEIVED";
  receivedAmount: number | null; receivedDate: string | null; createdAt: string;
};

interface Props {
  chits: Chit[];
  receivables: Receivable[];
  cards: CCCard[];
  currentMonthLabel: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NETWORKS = ["Visa", "Mastercard", "Rupay", "Amex"] as const;

const BANKS = [
  "Axis Bank", "HDFC Bank", "ICICI Bank", "State Bank of India", "Kotak Mahindra Bank",
  "IndusInd Bank", "Federal Bank", "IDFC FIRST Bank", "Yes Bank", "RBL Bank",
  "Standard Chartered", "Citibank", "American Express", "Bank of Baroda",
  "Punjab National Bank", "Canara Bank", "IDBI Bank", "AU Small Finance Bank",
  "Bandhan Bank", "HSBC", "Other",
] as const;
const RECV_LABELS: Record<string, string> = { INVESTMENT: "Investment", PERSONAL_LOAN: "Personal Loan", CUSTOM: "Custom" };
const RECV_COLORS: Record<string, string> = {
  INVESTMENT: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  PERSONAL_LOAN: "bg-amber-50 text-amber-700 border border-amber-200",
  CUSTOM: "bg-gray-100 text-gray-600 border border-gray-200",
  CHIT_FUND: "bg-amber-50 text-amber-700 border border-amber-200",
};

type MainTab = "cards" | "chits" | "receivables";
type RecvTab = "pending" | "received";

// ── Add-card dialog ───────────────────────────────────────────────────────────

function AddCardDialog({ open, onOpenChange, onAdd }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (data: { name: string; bank?: string; network?: string; last4?: string; statementDay?: number; dueDateDay?: number }) => Promise<void>;
}) {
  const [name, setName]         = useState("");
  const [bank, setBank]         = useState("");
  const [bankOther, setBankOther] = useState("");
  const [network, setNetwork]   = useState("");
  const [last4, setLast4]       = useState("");
  const [stmtDay, setStmtDay]   = useState("");
  const [dueDay, setDueDay]     = useState("");
  const [saving, setSaving]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const bankValue = bank === "Other" ? bankOther.trim() : bank;
    setSaving(true);
    try {
      await onAdd({
        name: name.trim(),
        ...(bankValue      && { bank: bankValue }),
        ...(network        && { network }),
        ...(last4.trim()   && { last4: last4.trim() }),
        ...(stmtDay        && { statementDay: parseInt(stmtDay) }),
        ...(dueDay         && { dueDateDay:   parseInt(dueDay)  }),
      });
      setName(""); setBank(""); setBankOther(""); setNetwork(""); setLast4(""); setStmtDay(""); setDueDay("");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Credit Card</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs">Card name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Axis Bank CC" className="mt-1" required />
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
            Filling in bank, network, and last 4 digits below (all optional) helps Gmail Imports automatically match transactions to this card.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Bank</Label>
              <select value={bank} onChange={e => setBank(e.target.value)}
                className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <option value="">Select</option>
                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Network</Label>
              <select value={network} onChange={e => setNetwork(e.target.value)}
                className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <option value="">Select</option>
                {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {bank === "Other" && (
              <div className="col-span-2">
                <Label className="text-xs">Bank name</Label>
                <Input value={bankOther} onChange={e => setBankOther(e.target.value)} placeholder="Bank name" className="mt-1" autoFocus />
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">Last 4 digits</Label>
            <Input value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1234" className="mt-1" maxLength={4} inputMode="numeric" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Statement closes (day)</Label>
              <Input type="number" min={1} max={31} value={stmtDay} onChange={e => setStmtDay(e.target.value)} placeholder="15" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Payment due (day)</Label>
              <Input type="number" min={1} max={31} value={dueDay} onChange={e => setDueDay(e.target.value)} placeholder="5" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()}>{saving ? "Adding..." : "Add Card"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── CC Card row ───────────────────────────────────────────────────────────────

const NETWORK_ACCENT: Record<string, { bar: string; badge: string }> = {
  Visa:       { bar: "bg-gray-400",    badge: "bg-gray-50 text-gray-600 border-gray-200" },
  Mastercard: { bar: "bg-red-500",     badge: "bg-red-50 text-red-500 border-red-200" },
  Rupay:      { bar: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200" },
  Amex:       { bar: "bg-emerald-600", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

function CCCardTile({ card, fmt, onEntryUpdate, onDelete, onMetaUpdate }: {
  card: CCCard;
  fmt: (v: number) => string;
  currentMonthLabel: string;
  onEntryUpdate: (cardTemplateId: string, updates: { amount?: number; billedAmount?: number; isPaid?: boolean }) => Promise<void>;
  onDelete: (cardId: string) => void;
  onMetaUpdate: (cardId: string, updates: { statementDay?: number | null; dueDateDay?: number | null; bank?: string | null; network?: string | null; last4?: string | null }) => Promise<void>;
}) {
  const entry   = card.currentEntry;
  const billed  = entry ? (entry.billedAmount ?? entry.amount) : null;
  const paying  = entry?.amount ?? 0;
  const rolling = billed != null ? Math.max(0, billed - paying) : 0;
  const accent  = card.network ? NETWORK_ACCENT[card.network] : null;

  const [settingBill, setSettingBill]     = useState(false);
  const [billInput, setBillInput]         = useState("");
  const [saving, setSaving]               = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingDates, setEditingDates]   = useState(false);
  const [stmtInput, setStmtInput]         = useState(String(card.template.statementDay ?? ""));
  const [dueInput, setDueInput]           = useState(String(card.template.dueDateDay ?? ""));
  const [savingDates, setSavingDates]     = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const isKnownBank = !!card.bank && (BANKS as readonly string[]).includes(card.bank);
  const [bankInput, setBankInput]         = useState(isKnownBank ? card.bank! : (card.bank ? "Other" : ""));
  const [bankOtherInput, setBankOtherInput] = useState(isKnownBank ? "" : (card.bank ?? ""));
  const [networkInput, setNetworkInput]   = useState(card.network ?? "");
  const [last4Input, setLast4Input]       = useState(card.last4 ?? "");
  const [savingDetails, setSavingDetails] = useState(false);

  async function handleSaveDetails() {
    const bankValue = bankInput === "Other" ? bankOtherInput.trim() : bankInput;
    setSavingDetails(true);
    try {
      await onMetaUpdate(card.id, {
        bank: bankValue || null,
        network: networkInput || null,
        last4: last4Input.trim() || null,
      });
      setEditingDetails(false);
    } finally { setSavingDetails(false); }
  }

  async function handleSaveDates() {
    setSavingDates(true);
    try {
      await onMetaUpdate(card.id, {
        statementDay: stmtInput ? parseInt(stmtInput) : null,
        dueDateDay:   dueInput  ? parseInt(dueInput)  : null,
      });
      setEditingDates(false);
    } finally { setSavingDates(false); }
  }

  async function handleSetBill() {
    const val = parseFloat(billInput);
    if (isNaN(val) || val < 0) return;
    setSaving(true);
    try {
      await onEntryUpdate(card.template.id, { billedAmount: val, amount: val });
      setSettingBill(false); setBillInput("");
    } finally { setSaving(false); }
  }

  return (
    <div className={cn(
      "rounded-xl border border-border bg-card overflow-hidden",
      entry?.isPaid && "opacity-60"
    )}>
      {/* Network colour bar */}
      <div className={cn("h-1 w-full", accent?.bar ?? "bg-zinc-200")} />

      <div className="px-4 pt-3 pb-4 space-y-3">

        {/* Header: name + delete */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{card.template.name}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {card.bank && <p className="text-xs text-muted-foreground">{card.bank}</p>}
              {card.network && (
                <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded border", accent?.badge ?? "bg-zinc-50 text-zinc-600 border-zinc-200")}>
                  {card.network}
                </span>
              )}
              {card.last4 && <p className="text-xs text-muted-foreground">•• {card.last4}</p>}
              <button onClick={() => setEditingDetails(v => !v)}
                className="text-muted-foreground/40 hover:text-foreground transition-colors">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
            {!card.last4 && !editingDetails && (
              <button
                onClick={() => setEditingDetails(true)}
                className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 hover:bg-amber-100 transition-colors"
              >
                Add last 4 digits for better matching
              </button>
            )}
          </div>
          {confirmDelete ? (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => onDelete(card.id)}
                className="text-xs font-semibold text-destructive border border-destructive/30 px-3 py-1.5 rounded-lg">
                Delete
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-lg">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {editingDetails && (
          <div className="space-y-2 pb-1 border-b border-border/50">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Bank</Label>
                <select value={bankInput} onChange={e => setBankInput(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Select</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Network</Label>
                <select value={networkInput} onChange={e => setNetworkInput(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Select</option>
                  {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            {bankInput === "Other" && (
              <div>
                <Label className="text-xs">Bank name</Label>
                <Input value={bankOtherInput} onChange={e => setBankOtherInput(e.target.value)} placeholder="Bank name" className="mt-1 h-9" autoFocus />
              </div>
            )}
            <div>
              <Label className="text-xs">Last 4 digits <span className="text-muted-foreground">(helps auto-match imported transactions)</span></Label>
              <Input value={last4Input} onChange={e => setLast4Input(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234" maxLength={4} inputMode="numeric" className="mt-1 h-9" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveDetails} disabled={savingDetails} className="flex-1 h-9">
                {savingDetails ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingDetails(false)} className="flex-1 h-9">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Bill amount area */}
        {settingBill ? (
          <div className="space-y-2">
            <Input
              type="number" min={0} step={1}
              value={billInput} onChange={e => setBillInput(e.target.value)}
              placeholder="Bill amount (₹)" className="h-11 text-base"
              autoFocus onKeyDown={e => { if (e.key === "Enter") handleSetBill(); if (e.key === "Escape") setSettingBill(false); }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSetBill} disabled={saving} className="flex-1 h-10">
                {saving ? "Saving…" : "Set Bill"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setSettingBill(false); setBillInput(""); }} className="flex-1 h-10">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            {billed != null ? (
              <>
                <p className="text-2xl font-bold tabular-nums">{fmt(billed)}</p>
                {rolling > 0 && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />{fmt(rolling)} rolling to next month
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground/60 italic">No bill set yet</p>
            )}
            {!!entry?.statementAmount && (
              <p className="text-xs text-muted-foreground mt-1">
                Next statement so far: <span className="font-medium text-foreground">{fmt(entry.statementAmount)}</span>
              </p>
            )}
          </div>
        )}

        {/* Dates edit */}
        {editingDates ? (
          <div className="space-y-2 pt-1 border-t border-border/50">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Closes on (day)</Label>
                <Input type="number" min={1} max={31} value={stmtInput}
                  onChange={e => setStmtInput(e.target.value)} placeholder="e.g. 15" className="mt-1 h-10" />
              </div>
              <div>
                <Label className="text-xs">Payment due (day)</Label>
                <Input type="number" min={1} max={31} value={dueInput}
                  onChange={e => setDueInput(e.target.value)} placeholder="e.g. 5" className="mt-1 h-10" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveDates} disabled={savingDates} className="flex-1 h-10">
                {savingDates ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingDates(false)} className="flex-1 h-10">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditingDates(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
          >
            <Pencil className="w-3.5 h-3.5 shrink-0" />
            {(card.template.statementDay || card.template.dueDateDay) ? (
              <span>
                {card.template.statementDay && `Closes ${card.template.statementDay}th`}
                {card.template.statementDay && card.template.dueDateDay && " · "}
                {card.template.dueDateDay && `Due ${card.template.dueDateDay}th`}
              </span>
            ) : (
              <span className="italic text-muted-foreground/50">Add statement & due dates</span>
            )}
          </button>
        )}

        {/* Action buttons */}
        {!settingBill && !editingDates && (
          entry?.isPaid ? (
            <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 pt-1 border-t border-border/50">
              <CheckCircle2 className="w-4 h-4" /> Paid this month
            </div>
          ) : billed != null ? (
            <div className="flex gap-2 pt-1 border-t border-border/50">
              <Button
                size="sm"
                onClick={() => onEntryUpdate(card.template.id, { isPaid: true })}
                className="flex-1 h-10 bg-primary hover:bg-primary/90 text-white"
              >
                Mark paid
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => { setBillInput(String(billed)); setSettingBill(true); }}
                className="h-10 px-4"
              >
                Edit
              </Button>
            </div>
          ) : (
            <Button
              size="sm" variant="outline"
              onClick={() => { setBillInput(""); setSettingBill(true); }}
              className="w-full h-10 pt-1 border-t-0"
            >
              Set bill amount
            </Button>
          )
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReceivablesClient({ chits: initialChits, receivables: initialReceivables, cards: initialCards, currentMonthLabel }: Props) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);

  const [chits, setChits]           = useState(initialChits);
  const [receivables, setReceivables] = useState(initialReceivables);
  const [cards, setCards]           = useState(initialCards);
  const [mainTab, setMainTab]       = useState<MainTab>("cards");
  const [recvTab, setRecvTab]       = useState<RecvTab>("pending");

  const [showAddCard, setShowAddCard]         = useState(false);
  const [showAddChit, setShowAddChit]         = useState(false);
  const [showAddReceivable, setShowAddReceivable] = useState(false);
  const [liftingChit, setLiftingChit]         = useState<Chit | null>(null);
  const [editingChit, setEditingChit]         = useState<Chit | null>(null);
  const [receivingItem, setReceivingItem]     = useState<Receivable | null>(null);
  const [deletingChitId, setDeletingChitId]   = useState<string | null>(null);
  const [deleteChitInProgress, setDeleteChitInProgress] = useState<string | null>(null);

  const unliftedChits = chits.filter(c => !c.isLifted && c.template.isActive);
  const liftedChits   = chits.filter(c => c.isLifted);
  const pendingReceivables  = receivables.filter(r => r.status === "PENDING");
  const receivedReceivables = receivables.filter(r => r.status === "RECEIVED");
  const activeCards   = cards.filter(c => c.template.isActive);

  // ── Card handlers ──────────────────────────────────────────────────────────

  async function handleAddCard(data: { name: string; bank?: string; network?: string; last4?: string; statementDay?: number; dueDateDay?: number }) {
    const res = await fetch("/api/credit-cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!res.ok) { toast.error("Failed to add card"); return; }
    const newCard = await res.json();
    setCards(prev => [...prev, { ...newCard, currentEntry: null }]);
    toast.success("Card added");
    setShowAddCard(false);
  }

  async function handleCardEntryUpdate(cardTemplateId: string, updates: { amount?: number; billedAmount?: number; isPaid?: boolean }) {
    const res = await fetch("/api/credit-cards/set-bill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: cardTemplateId, ...updates }),
    });
    if (!res.ok) { toast.error("Failed to update bill"); return; }
    const updated = await res.json();
    setCards(prev => prev.map(c => c.template.id === cardTemplateId
      ? { ...c, currentEntry: updated }
      : c));
    toast.success("Updated");
  }

  async function handleDeleteCard(cardId: string) {
    const res = await fetch(`/api/credit-cards/${cardId}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to remove card"); return; }
    setCards(prev => prev.filter(c => c.id !== cardId));
    toast.success("Card removed");
  }

  async function handleCardMetaUpdate(cardId: string, updates: { statementDay?: number | null; dueDateDay?: number | null; bank?: string | null; network?: string | null; last4?: string | null }) {
    const res = await fetch(`/api/credit-cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) { toast.error("Failed to update card"); return; }
    const updated = await res.json();
    setCards(prev => prev.map(c => c.id === cardId
      ? { ...c, bank: updated.bank, network: updated.network, last4: updated.last4, template: { ...c.template, statementDay: updated.template.statementDay, dueDateDay: updated.template.dueDateDay } }
      : c));
    toast.success("Card updated");
  }

  // ── Chit handlers ──────────────────────────────────────────────────────────

  async function handleAddChit(data: { name: string; totalValue: number; durationMonths: number; startDate: string; monthlyUnliftedAmount: number; monthlyLiftedAmount?: number; dueDateDay?: number }) {
    const res = await fetch("/api/chits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!res.ok) { toast.error("Failed to add chit"); return; }
    const newChit = await res.json();
    setChits(prev => [...prev, newChit]);
    toast.success("Chit fund added");
    setShowAddChit(false);
  }

  async function handleLift(chitId: string, data: { liftedAmount: number; monthlyLiftedAmount: number; liftMonth: number; liftYear: number }) {
    const res = await fetch(`/api/chits/${chitId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isLifted: true, ...data }) });
    if (!res.ok) { toast.error("Failed to lift chit"); return; }
    const updated = await res.json();
    setChits(prev => prev.map(c => c.id === chitId ? updated : c));
    toast.success("Chit lifted, income recorded");
    setLiftingChit(null);
  }

  async function handleEditChit(chitId: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/chits/${chitId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!res.ok) { toast.error("Failed to update chit"); return; }
    const updated = await res.json();
    setChits(prev => prev.map(c => c.id === chitId ? updated : c));
    toast.success("Chit updated");
    setEditingChit(null);
  }

  async function handleDeleteChit(chitId: string) {
    if (deleteChitInProgress) return;
    setDeleteChitInProgress(chitId);
    try {
      const res = await fetch(`/api/chits/${chitId}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Failed to delete chit"); return; }
      setChits(prev => prev.filter(c => c.id !== chitId));
      toast.success("Chit deleted");
      setDeletingChitId(null);
    } finally { setDeleteChitInProgress(null); }
  }

  // ── Receivable handlers ────────────────────────────────────────────────────

  async function handleAddReceivable(data: { category: "INVESTMENT" | "PERSONAL_LOAN" | "CUSTOM"; customCategory?: string; description: string; expectedAmount: number; expectedDate?: string }) {
    const res = await fetch("/api/receivables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!res.ok) { toast.error("Failed to add receivable"); return; }
    const newR = await res.json();
    setReceivables(prev => [newR, ...prev]);
    toast.success("Receivable added");
    setShowAddReceivable(false);
  }

  async function handleMarkReceived(id: string, data: { receivedAmount: number; receivedMonth: number; receivedYear: number; receivedDate: string }) {
    const res = await fetch(`/api/receivables/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "RECEIVED", ...data }) });
    if (!res.ok) { toast.error("Failed to mark as received"); return; }
    const updated = await res.json();
    setReceivables(prev => prev.map(r => r.id === id ? updated : r));
    toast.success("Marked as received, income recorded");
    setReceivingItem(null);
  }

  async function handleDeleteReceivable(id: string) {
    const res = await fetch(`/api/receivables/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
    setReceivables(prev => prev.filter(r => r.id !== id));
    toast.success("Removed");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const tabs: { key: MainTab; label: string; icon: React.ReactNode }[] = [
    { key: "cards",       label: "Cards",       icon: <CreditCard className="w-3.5 h-3.5" /> },
    { key: "chits",       label: "Chits",       icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { key: "receivables", label: "Receivables", icon: <Wallet className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-5">
      <PageCoach
        coachKey="receivables"
        icon={Wallet}
        iconClass="text-emerald-600"
        bgClass="bg-emerald-50 border-emerald-100"
        title="Accounts"
        desc="Manage your credit cards, chit funds, and money owed to you — all in one place."
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">Vault</h1>
        <div className="shrink-0">
          {mainTab === "cards"       && <Button size="sm" onClick={() => setShowAddCard(true)}       className="h-8 px-3 text-xs sm:h-9 sm:px-4 sm:text-sm"><Plus className="w-3.5 h-3.5 mr-1" />Add Card</Button>}
          {mainTab === "chits"       && <Button size="sm" variant="outline" onClick={() => setShowAddChit(true)}       className="h-8 px-3 text-xs sm:h-9 sm:px-4 sm:text-sm"><Plus className="w-3.5 h-3.5 mr-1" />Add Chit</Button>}
          {mainTab === "receivables" && <Button size="sm" onClick={() => setShowAddReceivable(true)} className="h-8 px-3 text-xs sm:h-9 sm:px-4 sm:text-sm"><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>}
        </div>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
              mainTab === t.key ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Cards tab ─────────────────────────────────────────────────────── */}
      {mainTab === "cards" && (
        <div className="space-y-3">
          {activeCards.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <CreditCard className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm">No credit cards added yet.</p>
              <p className="text-xs mt-1">Add your cards to track bills and carry-forwards.</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {activeCards.map(card => (
              <CCCardTile
                key={card.id}
                card={card}
                fmt={fmt}
                currentMonthLabel={currentMonthLabel}
                onEntryUpdate={handleCardEntryUpdate}
                onDelete={handleDeleteCard}
                onMetaUpdate={handleCardMetaUpdate}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Chits tab ─────────────────────────────────────────────────────── */}
      {mainTab === "chits" && (
        <div className="space-y-5">
          {/* Active chits */}
          {unliftedChits.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Active</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {unliftedChits.map(chit => {
                  const sd = new Date(chit.startDate);
                  const smIdx = sd.getUTCMonth();
                  const endIdx = (smIdx + chit.durationMonths - 1) % 12;
                  const endYear = sd.getUTCFullYear() + Math.floor((smIdx + chit.durationMonths - 1) / 12);
                  const endStr = `${MONTHS[endIdx]} ${endYear}`;
                  return (
                    <Card key={chit.id}>
                      <CardHeader className="pb-2 px-4 pt-4">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm font-semibold truncate">{chit.template.name}</CardTitle>
                          <Badge className="text-xs shrink-0 bg-amber-50 text-amber-700 border border-amber-200">
                            <TrendingUp className="w-3 h-3 mr-1" />Active
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Pot value</p>
                            <p className="font-semibold">{fmt(chit.totalValue)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Monthly</p>
                            <p className="font-semibold">
                              {fmt(chit.monthlyUnliftedAmount)}
                              {chit.template.dueDateDay && (
                                <span className="ml-1 text-xs font-normal text-muted-foreground">due {chit.template.dueDateDay}th</span>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Period</p>
                            <p className="font-semibold text-xs">
                              {format(sd, "MMM yyyy")} → {endStr}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Duration</p>
                            <p className="font-semibold">{chit.durationMonths} months</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="flex-1 h-8 text-xs"
                            onClick={() => setEditingChit(chit)}>
                            <Pencil className="w-3 h-3 mr-1" />Edit
                          </Button>
                          <Button size="sm" className="flex-1 h-8 text-xs bg-amber-600 hover:bg-amber-700"
                            onClick={() => setLiftingChit(chit)}>
                            Mark as Lifted
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lifted chits */}
          {liftedChits.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Lifted</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {liftedChits.map(chit => (
                  <Card key={chit.id} className="opacity-75">
                    <CardHeader className="pb-2 px-4 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm font-semibold truncate">{chit.template.name}</CardTitle>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-xs text-gray-500 border-gray-200">
                            <TrendingDown className="w-3 h-3 mr-1" />Lifted
                          </Badge>
                          {deletingChitId === chit.id ? (
                            <div className="flex items-center gap-1">
                              <Button variant="destructive" size="sm" className="h-6 text-xs px-2" disabled={deleteChitInProgress === chit.id} onClick={() => handleDeleteChit(chit.id)}>
                                {deleteChitInProgress === chit.id ? "Deleting..." : "Confirm"}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" disabled={deleteChitInProgress === chit.id} onClick={() => setDeletingChitId(null)}>Cancel</Button>
                            </div>
                          ) : (
                            <button onClick={() => setDeletingChitId(chit.id)} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Pot received</p>
                          <p className="font-semibold text-emerald-600">{fmt(chit.liftedAmount ?? chit.totalValue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Lifted in</p>
                          <p className="font-semibold">{chit.liftedOn ? format(new Date(chit.liftedOn), "MMM yyyy") : "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Monthly now</p>
                          <p className="font-semibold">
                            {fmt(chit.monthlyLiftedAmount ?? chit.monthlyUnliftedAmount)}
                            {chit.template.dueDateDay && (
                              <span className="ml-1 text-xs font-normal text-muted-foreground">due {chit.template.dueDateDay}th</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="w-full h-8 text-xs"
                        onClick={() => setEditingChit(chit)}>
                        <Pencil className="w-3 h-3 mr-1" />Edit
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {unliftedChits.length === 0 && liftedChits.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <TrendingUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm">No chit funds yet.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Receivables tab ────────────────────────────────────────────────── */}
      {mainTab === "receivables" && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
            {(["pending", "received"] as RecvTab[]).map(t => (
              <button
                key={t}
                onClick={() => setRecvTab(t)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  recvTab === t ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "pending" ? <><Clock className="w-3.5 h-3.5" />Pending</> : <><CheckCircle2 className="w-3.5 h-3.5" />Received</>}
              </button>
            ))}
          </div>

          {recvTab === "pending" && (
            <div>
              {pendingReceivables.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {pendingReceivables.map(r => (
                    <Card key={r.id}>
                      <CardHeader className="pb-2 px-4 pt-4">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm font-semibold truncate">{r.description}</CardTitle>
                          <Badge className={cn("text-xs shrink-0", RECV_COLORS[r.category])}>
                            {r.customCategory ?? RECV_LABELS[r.category]}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Expected</p>
                            <p className="font-semibold text-emerald-600">{fmt(r.expectedAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Due By</p>
                            <p className="font-semibold">{r.expectedDate ? format(new Date(r.expectedDate), "dd MMM yy") : "-"}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1 h-8 text-xs bg-primary hover:bg-primary/90 text-white" onClick={() => setReceivingItem(r)}>
                            <Wallet className="w-3.5 h-3.5 mr-1" />Mark Received
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteReceivable(r.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <Wallet className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-sm">No pending receivables.</p>
                </div>
              )}
            </div>
          )}

          {recvTab === "received" && (
            <div>
              {receivedReceivables.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {receivedReceivables.map(r => (
                    <Card key={r.id} className="opacity-75">
                      <CardHeader className="pb-2 px-4 pt-4">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm font-semibold truncate">{r.description}</CardTitle>
                          <Badge className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                            <CheckCircle2 className="w-3 h-3 mr-1" />Received
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Received</p>
                            <p className="font-semibold text-emerald-600">{fmt(r.receivedAmount ?? r.expectedAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">On</p>
                            <p className="font-semibold">{r.receivedDate ? format(new Date(r.receivedDate), "dd MMM yy") : "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Expected</p>
                            <p className="font-semibold text-muted-foreground">{fmt(r.expectedAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Category</p>
                            <p className="font-semibold">{r.customCategory ?? RECV_LABELS[r.category]}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-sm">Nothing received yet.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      {showAddCard && <AddCardDialog open={showAddCard} onOpenChange={setShowAddCard} onAdd={handleAddCard} />}
      {showAddChit && <AddChitDialog open={showAddChit} onOpenChange={setShowAddChit} onAdd={handleAddChit} />}
      {showAddReceivable && <AddReceivableDialog open={showAddReceivable} onOpenChange={setShowAddReceivable} onAdd={handleAddReceivable} />}
      {liftingChit && (
        <LiftChitDialog
          open={!!liftingChit} onOpenChange={o => !o && setLiftingChit(null)}
          chit={liftingChit} onLift={data => handleLift(liftingChit.id, data)}
        />
      )}
      {editingChit && (
        <EditChitDialog
          open={!!editingChit} onOpenChange={o => !o && setEditingChit(null)}
          chit={editingChit} onSave={handleEditChit}
        />
      )}
      {receivingItem && (
        <MarkReceivedDialog
          open={!!receivingItem} onOpenChange={o => !o && setReceivingItem(null)}
          receivable={receivingItem} onConfirm={data => handleMarkReceived(receivingItem.id, data)}
        />
      )}
    </div>
  );
}
