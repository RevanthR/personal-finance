"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TabsUnderline, type TabsUnderlineOption } from "@/components/ui/tabs-underline";
import { formatCurrency, cn, MONTHS } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { Plus, TrendingUp, TrendingDown, Wallet, Clock, CheckCircle2, Trash2, CreditCard, Pencil } from "lucide-react";
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
// Color reserved for actual gain/loss (matching the reference app's
// restraint) — categories that aren't inherently positive/negative stay
// neutral instead of borrowing the warning/amber token.
const RECV_COLORS: Record<string, string> = {
  INVESTMENT: "bg-positive-bg text-positive border border-positive-border",
  PERSONAL_LOAN: "bg-muted text-muted-foreground border border-border",
  CUSTOM: "bg-muted text-muted-foreground border border-border",
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
          <p className="text-xs text-muted-foreground bg-muted border border-border rounded-md px-2.5 py-1.5">
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

// ── Edit-card dialog ──────────────────────────────────────────────────────────
// Combines bank/network/last4 and statement/due-day editing in one place —
// previously two separate inline-expanding sections on the card itself,
// unlike every other edit flow in this page (chits, receivables), which
// opens a single dialog.

function EditCardDialog({ open, onOpenChange, card, onSave }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  card: CCCard;
  onSave: (data: { bank: string | null; network: string | null; last4: string | null; statementDay: number | null; dueDateDay: number | null }) => Promise<void>;
}) {
  const isKnownBank = !!card.bank && (BANKS as readonly string[]).includes(card.bank);
  const [bank, setBank]         = useState(isKnownBank ? card.bank! : (card.bank ? "Other" : ""));
  const [bankOther, setBankOther] = useState(isKnownBank ? "" : (card.bank ?? ""));
  const [network, setNetwork]   = useState(card.network ?? "");
  const [last4, setLast4]       = useState(card.last4 ?? "");
  const [stmtDay, setStmtDay]   = useState(String(card.template.statementDay ?? ""));
  const [dueDay, setDueDay]     = useState(String(card.template.dueDateDay ?? ""));
  const [saving, setSaving]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const bankValue = bank === "Other" ? bankOther.trim() : bank;
    setSaving(true);
    try {
      await onSave({
        bank: bankValue || null,
        network: network || null,
        last4: last4.trim() || null,
        statementDay: stmtDay ? parseInt(stmtDay) : null,
        dueDateDay: dueDay ? parseInt(dueDay) : null,
      });
      onOpenChange(false);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit {card.template.name}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
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
          </div>
          {bank === "Other" && (
            <div>
              <Label className="text-xs">Bank name</Label>
              <Input value={bankOther} onChange={e => setBankOther(e.target.value)} placeholder="Bank name" className="mt-1" autoFocus />
            </div>
          )}
          <div>
            <Label className="text-xs">Last 4 digits <span className="text-muted-foreground">(helps auto-match imported transactions)</span></Label>
            <Input value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="1234" maxLength={4} inputMode="numeric" className="mt-1" />
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
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── CC Card row ───────────────────────────────────────────────────────────────

// Per-network brand accent — intentionally distinct hues (not semantic
// status colors), so these stay literal rather than mapping to the
// positive/negative/warning tokens. dark: variants keep the light-mode
// -50 backgrounds from looking like a blown-out patch in dark mode.
const NETWORK_ACCENT: Record<string, { bar: string; badge: string }> = {
  Visa:       { bar: "bg-gray-400",    badge: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-400/10 dark:text-gray-300 dark:border-gray-400/30" },
  Mastercard: { bar: "bg-red-500",     badge: "bg-red-50 text-red-500 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30" },
  Rupay:      { bar: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30" },
  Amex:       { bar: "bg-emerald-600", badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30" },
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
  const [editingCard, setEditingCard]     = useState(false);

  async function handleSetBill() {
    const val = parseFloat(billInput);
    if (isNaN(val) || val < 0) return;
    setSaving(true);
    try {
      await onEntryUpdate(card.template.id, { billedAmount: val, amount: val });
      setSettingBill(false); setBillInput("");
    } finally { setSaving(false); }
  }

  const dueLabel = card.template.statementDay || card.template.dueDateDay
    ? [
        card.template.statementDay && `Closes ${card.template.statementDay}th`,
        card.template.dueDateDay && `Due ${card.template.dueDateDay}th`,
      ].filter(Boolean).join(" · ")
    : "-";

  return (
    <Card className={cn(entry?.isPaid && "opacity-60")}>
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold truncate">{card.template.name}</CardTitle>
            {(card.bank || card.last4) && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {card.bank}{card.bank && card.last4 && " · "}{card.last4 && `•• ${card.last4}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {card.network && (
              <Badge className={cn("text-xs shrink-0", accent?.badge ?? "bg-muted text-muted-foreground border border-border")}>
                {card.network}
              </Badge>
            )}
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button variant="destructive" size="sm" className="h-6 text-xs px-2" onClick={() => onDelete(card.id)}>Confirm</Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {!card.last4 && (
          <button
            onClick={() => setEditingCard(true)}
            className="text-xs text-accent-foreground bg-accent border border-primary/20 rounded-full px-2 py-0.5 hover:bg-accent/70 transition-colors"
          >
            Add last 4 digits for better matching
          </button>
        )}

        {settingBill ? (
          <div className="space-y-2">
            <Input
              type="number" min={0} step={1}
              value={billInput} onChange={e => setBillInput(e.target.value)}
              placeholder="Bill amount (₹)" className="h-10 text-sm"
              autoFocus onKeyDown={e => { if (e.key === "Enter") handleSetBill(); if (e.key === "Escape") setSettingBill(false); }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSetBill} disabled={saving} className="flex-1 h-9">
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setSettingBill(false); setBillInput(""); }} className="flex-1 h-9">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <button className="text-left" onClick={() => { setBillInput(billed != null ? String(billed) : ""); setSettingBill(true); }}>
              <p className="text-xs text-muted-foreground flex items-center gap-1">Bill<Pencil className="w-2.5 h-2.5 text-muted-foreground/60" /></p>
              <p className="font-semibold">{billed != null ? fmt(billed) : "-"}</p>
              {rolling > 0 && <p className="text-xs text-warning mt-0.5">{fmt(rolling)} rolling</p>}
            </button>
            <div>
              <p className="text-xs text-muted-foreground">Due</p>
              <p className="font-semibold text-xs">{dueLabel}</p>
              {!!entry?.statementAmount && (
                <p className="text-xs text-muted-foreground mt-0.5">Next: {fmt(entry.statementAmount)}</p>
              )}
            </div>
          </div>
        )}

        {!settingBill && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => setEditingCard(true)}>
              <Pencil className="w-3 h-3 mr-1" />Edit
            </Button>
            {entry?.isPaid ? (
              <div className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-positive">
                <CheckCircle2 className="w-3.5 h-3.5" /> Paid
              </div>
            ) : (
              <Button
                size="sm"
                className="flex-1 h-8 text-xs bg-primary hover:bg-primary/90 text-white"
                disabled={billed == null}
                onClick={() => onEntryUpdate(card.template.id, { isPaid: true })}
              >
                Mark paid
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <EditCardDialog
        open={editingCard}
        onOpenChange={setEditingCard}
        card={card}
        onSave={data => onMetaUpdate(card.id, data)}
      />
    </Card>
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

  const tabs: TabsUnderlineOption<MainTab>[] = [
    { value: "cards",       label: "Cards",       icon: CreditCard },
    { value: "chits",       label: "Chits",       icon: TrendingUp },
    { value: "receivables", label: "Receivables", icon: Wallet },
  ];

  return (
    <div className="space-y-5">
      <PageCoach
        coachKey="receivables"
        icon={Wallet}
        iconClass="text-positive"
        bgClass="bg-positive-bg border-positive-border"
        title="Vault"
        desc="Manage your credit cards, chit funds, and money owed to you, all in one place."
      />

      <PageHeader
        title="Vault"
        action={
          <>
            {mainTab === "cards"       && <Button size="sm" onClick={() => setShowAddCard(true)}       className="h-8 px-3 text-xs sm:h-9 sm:px-4 sm:text-sm"><Plus className="w-3.5 h-3.5 mr-1" />Add Card</Button>}
            {mainTab === "chits"       && <Button size="sm" onClick={() => setShowAddChit(true)}       className="h-8 px-3 text-xs sm:h-9 sm:px-4 sm:text-sm"><Plus className="w-3.5 h-3.5 mr-1" />Add Chit</Button>}
            {mainTab === "receivables" && <Button size="sm" onClick={() => setShowAddReceivable(true)} className="h-8 px-3 text-xs sm:h-9 sm:px-4 sm:text-sm"><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>}
          </>
        }
      />

      <TabsUnderline value={mainTab} onChange={setMainTab} options={tabs} />

      {/* ── Cards tab ─────────────────────────────────────────────────────── */}
      {mainTab === "cards" && (
        <div className="space-y-3">
          {activeCards.length === 0 && (
            <EmptyState
              icon={CreditCard}
              title="No credit cards added yet"
              description="Add your cards to track bills and carry-forwards."
              action={<Button size="sm" onClick={() => setShowAddCard(true)}><Plus className="w-3.5 h-3.5 mr-1" />Add Card</Button>}
            />
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
              <p className="fin-label mb-3">Active</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
                          <Badge className="text-xs shrink-0 bg-accent text-accent-foreground border border-primary/20">
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
                          <Button size="sm" className="flex-1 h-8 text-xs"
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
              <p className="fin-label mb-3">Lifted</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {liftedChits.map(chit => (
                  <Card key={chit.id} className="opacity-75">
                    <CardHeader className="pb-2 px-4 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm font-semibold truncate">{chit.template.name}</CardTitle>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-xs text-muted-foreground border-border">
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
                          <p className="font-semibold text-positive">{fmt(chit.liftedAmount ?? chit.totalValue)}</p>
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
            <EmptyState icon={TrendingUp} title="No chit funds yet" />
          )}
        </div>
      )}

      {/* ── Receivables tab ────────────────────────────────────────────────── */}
      {mainTab === "receivables" && (
        <div className="space-y-4">
          <TabsUnderline
            value={recvTab}
            onChange={setRecvTab}
            options={[
              { value: "pending", label: "Pending", icon: Clock },
              { value: "received", label: "Received", icon: CheckCircle2 },
            ]}
          />

          {recvTab === "pending" && (
            <div>
              {pendingReceivables.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
                            <p className="font-semibold text-positive">{fmt(r.expectedAmount)}</p>
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
                <EmptyState icon={Wallet} title="No pending receivables" />
              )}
            </div>
          )}

          {recvTab === "received" && (
            <div>
              {receivedReceivables.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {receivedReceivables.map(r => (
                    <Card key={r.id} className="opacity-75">
                      <CardHeader className="pb-2 px-4 pt-4">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm font-semibold truncate">{r.description}</CardTitle>
                          <Badge className="text-xs bg-positive-bg text-positive border border-positive-border shrink-0">
                            <CheckCircle2 className="w-3 h-3 mr-1" />Received
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Received</p>
                            <p className="font-semibold text-positive">{fmt(r.receivedAmount ?? r.expectedAmount)}</p>
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
                <EmptyState icon={CheckCircle2} title="Nothing received yet" />
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
