"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, cn } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CreditCard, CheckCircle2, ChevronDown } from "lucide-react";
import { CardStatementSheet } from "./card-statement-sheet";

// ── Types (dates arrive as ISO strings after server serialisation) ───────────

type Status = {
  status: "unconfigured" | "open" | "awaiting" | "confirmed" | "paid" | "pastdue";
  statementBalance: number;
  statementGross: number;
  statementConfirmed: boolean;
  statementEstimated: number;
  unbilledSpends: number;
  pastDue: number;
  currentBalance: number;
  availableCredit: number | null;
  utilisation: number | null;
  cycleOpenDate: string | null;
  lastStatementDate: string | null;
  paymentDueDate: string | null;
  reconciliation: { logged: number; statement: number; delta: number } | null;
};

export type CardChargeRow = { id: string; date: string; amount: number; isCredit: boolean; name: string };

export type CardOverview = {
  cardId: string;
  templateId: string;
  name: string;
  bank: string | null;
  network: string | null;
  last4: string | null;
  statementDay: number | null;
  dueDateDay: number | null;
  creditLimit: number | null;
  isActive: boolean;
  status: Status;
  statements: {
    statementDate: string; paymentDueDate: string; statementBalance: number | null;
    confirmedAt: string | null; paidAmount: number; paidInFull: boolean; paidAt: string | null; cashback: number;
  }[];
  charges: CardChargeRow[];
};

// ── Date helpers ────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function reconciliationText(r: { delta: number }, fmt: (v: number) => string): string {
  return r.delta > 0
    ? `${fmt(Math.round(r.delta))} on the statement beyond your logged charges. Usually fees, GST, interest, an EMI instalment, or a cashback that wasn't captured.`
    : `${fmt(Math.round(-r.delta))} more in logged charges than the statement. A charge dated after the cut (on next month's bill), or a duplicate.`;
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  return Math.round((new Date(iso).getTime() - today.getTime()) / 86400000);
}

const NETWORK_ACCENT: Record<string, string> = {
  Visa: "bg-slate-100 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300",
  Mastercard: "bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400",
  Rupay: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  Amex: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
};

const STATUS_LABEL: Record<Status["status"], { text: string; tone: string }> = {
  unconfigured: { text: "Set up", tone: "bg-muted text-muted-foreground" },
  open: { text: "Spending", tone: "bg-muted text-muted-foreground" },
  awaiting: { text: "Confirm statement", tone: "bg-warning-bg text-warning" },
  confirmed: { text: "Due", tone: "bg-warning-bg text-warning" },
  paid: { text: "Paid", tone: "bg-positive-bg text-positive" },
  pastdue: { text: "Past due", tone: "bg-negative-bg text-negative" },
};

// ── One card ────────────────────────────────────────────────────────────────

function CardTile({
  card, onEdit, onDelete, onChanged,
}: {
  card: CardOverview;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => (hidden ? "••••" : formatCurrency(v));
  const router = useRouter();
  const s = card.status;

  const [confirming, setConfirming] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showStatements, setShowStatements] = useState(false);

  const dueDays = daysUntil(s.paymentDueDate);
  const utilPct = s.utilisation != null ? Math.round(s.utilisation * 100) : null;
  const meta = STATUS_LABEL[s.status];

  async function post(path: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(`/api/cards/${card.cardId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? "Something went wrong"); return; }
      onChanged();
      router.refresh();
    } finally { setBusy(false); }
  }

  const confirmDefault = Math.round(s.statementEstimated);

  return (
    <Card>
      <CardContent className="p-4 space-y-3.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{card.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {[card.bank, card.last4 && `•• ${card.last4}`].filter(Boolean).join(" · ") || "No details"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {card.network && (
              <Badge className={cn("text-xs border-0", NETWORK_ACCENT[card.network] ?? "bg-muted text-muted-foreground")}>
                {card.network}
              </Badge>
            )}
            <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", meta.tone)}>{meta.text}</span>
          </div>
        </div>

        {/* No statement date set */}
        {s.status === "unconfigured" && (
          <div className="rounded-lg bg-warning-bg/50 border border-warning/20 px-3 py-2.5 text-xs text-muted-foreground">
            Add a statement date and payment due date so this card can track its billing cycle.
            <button onClick={onEdit} className="ml-1 font-medium text-primary hover:underline">Set it up</button>
          </div>
        )}

        {/* The headline number */}
        {s.status !== "unconfigured" && s.status !== "open" && (
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {s.status === "awaiting" ? "Statement balance" : s.status === "paid" ? "Statement" : "Now owed"}
              </p>
              <p className={cn("text-xl font-bold tabular-nums mt-0.5",
                s.status === "pastdue" ? "text-negative" : s.status === "paid" ? "text-muted-foreground" : "text-foreground")}>
                {s.status === "paid" ? fmt(Math.round(s.statementEstimated)) : fmt(Math.round(s.statementBalance))}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {s.statementConfirmed ? "confirmed from statement" : "estimated from your charges"}
                {s.paymentDueDate && s.status !== "paid" && (
                  <> · due {fmtDate(s.paymentDueDate)}{dueDays != null && ` (${dueDays < 0 ? `${-dueDays}d overdue` : dueDays === 0 ? "today" : `in ${dueDays}d`})`}</>
                )}
              </p>
            </div>
            {s.status === "paid" && <CheckCircle2 className="w-5 h-5 text-positive shrink-0" />}
          </div>
        )}

        {/* Past due, when it's a separate older bill */}
        {s.pastDue > 0 && s.status === "pastdue" && (
          <div className="flex items-center justify-between text-xs rounded-lg bg-negative-bg/40 px-3 py-2">
            <span className="text-negative font-medium">Past due from an earlier statement</span>
            <span className="font-semibold tabular-nums text-negative">{fmt(Math.round(s.pastDue))}</span>
          </div>
        )}

        {s.reconciliation && (
          <p className="text-[11px] leading-snug text-muted-foreground">{reconciliationText(s.reconciliation, fmt)}</p>
        )}

        {/* This cycle's spend */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{s.status === "open" ? "Spent this cycle" : "This cycle so far"}</span>
          <span className="font-semibold tabular-nums">{s.unbilledSpends > 0 ? `+${fmt(Math.round(s.unbilledSpends))}` : fmt(0)}</span>
        </div>

        {/* Utilisation */}
        {utilPct != null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Utilisation</span>
              <span className="font-medium tabular-nums">{fmt(Math.round(s.currentBalance))} / {fmt(card.creditLimit!)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", utilPct >= 90 ? "bg-negative" : utilPct >= 70 ? "bg-warning" : "bg-primary")}
                style={{ width: `${Math.min(100, Math.max(2, utilPct))}%` }}
              />
            </div>
          </div>
        )}

        {/* Confirm statement */}
        {s.status === "awaiting" && !confirming && (
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-9 text-xs" disabled={busy}
              onClick={() => post("confirm", { statementBalance: confirmDefault })}>
              Confirm {fmt(confirmDefault)}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-9 text-xs" onClick={() => { setConfirmInput(String(confirmDefault)); setConfirming(true); }}>
              Enter amount
            </Button>
          </div>
        )}
        {s.status === "awaiting" && confirming && (
          <div className="flex gap-2">
            <Input type="number" min={0} value={confirmInput} onChange={e => setConfirmInput(e.target.value)}
              autoFocus placeholder="Statement balance" className="h-9 text-sm"
              onKeyDown={e => { if (e.key === "Enter") { const v = parseFloat(confirmInput); if (v >= 0) post("confirm", { statementBalance: v }).then(() => setConfirming(false)); } if (e.key === "Escape") setConfirming(false); }} />
            <Button size="sm" className="h-9 text-xs shrink-0" disabled={busy}
              onClick={() => { const v = parseFloat(confirmInput); if (v >= 0) post("confirm", { statementBalance: v }).then(() => setConfirming(false)); }}>Save</Button>
            <Button size="sm" variant="ghost" className="h-9 text-xs shrink-0" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        )}

        {/* Pay */}
        {(s.status === "confirmed" || s.status === "pastdue") && s.statementBalance > 0 && (
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-9 text-xs" disabled={busy} onClick={() => post("pay", { full: true })}>
              Mark paid ({fmt(Math.round(s.statementBalance))})
            </Button>
            <Button size="sm" variant="outline" className="h-9 text-xs shrink-0" disabled={busy} onClick={onEdit}>
              <Pencil className="w-3 h-3" />
            </Button>
          </div>
        )}
        {s.status === "paid" && (
          <button className="text-xs text-muted-foreground hover:text-foreground" disabled={busy} onClick={() => post("pay", { unpay: true })}>
            Undo payment
          </button>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/60">
          <button onClick={() => setShowStatements(true)} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
            Statements <ChevronDown className="w-3 h-3" />
          </button>
          <div className="flex items-center gap-3">
            {(s.status === "open" || s.status === "unconfigured" || s.status === "awaiting") && (
              <button onClick={onEdit} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
            <button onClick={onDelete} className="text-muted-foreground hover:text-negative">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </CardContent>

      {showStatements && (
        <CardStatementSheet
          open={showStatements}
          onOpenChange={setShowStatements}
          card={card}
          fmt={fmt}
        />
      )}
    </Card>
  );
}

// ── Add / edit dialog ───────────────────────────────────────────────────────

const NETWORKS = ["Visa", "Mastercard", "Rupay", "Amex"] as const;

function CardFormDialog({
  open, onOpenChange, existing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: CardOverview;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [bank, setBank] = useState(existing?.bank ?? "");
  const [network, setNetwork] = useState<string>(existing?.network ?? "");
  const [last4, setLast4] = useState(existing?.last4 ?? "");
  const [statementDay, setStatementDay] = useState(existing?.statementDay != null ? String(existing.statementDay) : "");
  const [dueDay, setDueDay] = useState(existing?.dueDateDay != null ? String(existing.dueDateDay) : "");
  const [limit, setLimit] = useState(existing?.creditLimit != null ? String(existing.creditLimit) : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (last4 && !/^\d{4}$/.test(last4)) { toast.error("Last 4 digits must be 4 numbers"); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        bank: bank.trim() || (existing ? null : undefined),
        network: (network || (existing ? null : undefined)) as string | null | undefined,
        last4: last4.trim() || (existing ? null : undefined),
        statementDay: statementDay ? parseInt(statementDay) : (existing ? null : undefined),
        dueDateDay: dueDay ? parseInt(dueDay) : (existing ? null : undefined),
        creditLimit: limit ? parseFloat(limit) : (existing ? null : undefined),
      };
      const res = existing
        ? await fetch(`/api/credit-cards/${existing.cardId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/credit-cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? "Could not save"); return; }
      toast.success(existing ? "Card updated" : "Card added");
      onOpenChange(false);
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{existing ? "Edit card" : "Add a card"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Amazon Pay ICICI" className="h-9 mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Bank</Label>
              <Input value={bank} onChange={e => setBank(e.target.value)} placeholder="ICICI" className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Last 4 digits</Label>
              <Input value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="0000" className="h-9 mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Network</Label>
            <div className="flex gap-1.5 mt-1">
              {NETWORKS.map(n => (
                <button key={n} type="button" onClick={() => setNetwork(network === n ? "" : n)}
                  className={cn("flex-1 h-8 text-xs rounded-md border transition-colors",
                    network === n ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:border-foreground/30")}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Statement date</Label>
              <Input type="number" min={1} max={31} value={statementDay} onChange={e => setStatementDay(e.target.value)} placeholder="Day, e.g. 2" className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Payment due date</Label>
              <Input type="number" min={1} max={31} value={dueDay} onChange={e => setDueDay(e.target.value)} placeholder="Day, e.g. 20" className="h-9 mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Credit limit</Label>
            <Input type="number" min={0} value={limit} onChange={e => setLimit(e.target.value)} placeholder="Optional" className="h-9 mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9">Cancel</Button>
          <Button onClick={save} disabled={saving} className="h-9">{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export function CardsClient({ cards: initial }: { cards: CardOverview[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<CardOverview | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CardOverview | null>(null);

  const active = cards.filter(c => c.isActive);
  const refresh = () => router.refresh();

  async function doDelete(card: CardOverview) {
    setConfirmDelete(null);
    setCards(prev => prev.filter(c => c.cardId !== card.cardId));
    const res = await fetch(`/api/credit-cards/${card.cardId}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not remove card"); setCards(initial); return; }
    toast.success("Card removed");
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Cards"
        subtitle="Statement balance, what's due, and this cycle's spend for each credit card."
        action={<Button size="sm" onClick={() => setShowAdd(true)} className="h-9"><Plus className="w-4 h-4 mr-1" /> Add card</Button>}
      />

      {active.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No cards yet"
          description="Add a card with its statement date and payment due date. Charges and statements flow in from Sync."
          action={<Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" /> Add card</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map(card => (
            <CardTile
              key={card.cardId}
              card={card}
              onEdit={() => setEditing(card)}
              onDelete={() => setConfirmDelete(card)}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      {showAdd && <CardFormDialog open={showAdd} onOpenChange={setShowAdd} onSaved={refresh} />}
      {editing && <CardFormDialog open onOpenChange={v => !v && setEditing(null)} existing={editing} onSaved={refresh} />}

      {confirmDelete && (
        <Dialog open onOpenChange={v => !v && setConfirmDelete(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Remove {confirmDelete.name}?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">The card is hidden from view. Its statements and charge history stay.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(null)} className="h-9">Cancel</Button>
              <Button variant="destructive" onClick={() => doDelete(confirmDelete)} className="h-9">Remove</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
