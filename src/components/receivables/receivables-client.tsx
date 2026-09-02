"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TabsUnderline, type TabsUnderlineOption } from "@/components/ui/tabs-underline";
import { formatCurrency, cn, MONTHS, ordinal } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { Plus, TrendingUp, TrendingDown, Wallet, Clock, CheckCircle2, Trash2, Pencil } from "lucide-react";
import { PageCoach } from "@/components/coach/page-coach";
import { toast } from "sonner";
import { format } from "date-fns";

const AddChitDialog       = dynamic(() => import("@/components/chits/add-chit-dialog").then(m => m.AddChitDialog), { ssr: false });
const LiftChitDialog      = dynamic(() => import("@/components/chits/lift-chit-dialog").then(m => m.LiftChitDialog), { ssr: false });
const EditChitDialog      = dynamic(() => import("@/components/chits/edit-chit-dialog").then(m => m.EditChitDialog), { ssr: false });
const AddReceivableDialog = dynamic(() => import("./add-receivable-dialog").then(m => m.AddReceivableDialog), { ssr: false });
const MarkReceivedDialog  = dynamic(() => import("./mark-received-dialog").then(m => m.MarkReceivedDialog), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

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
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RECV_LABELS: Record<string, string> = { INVESTMENT: "Investment", PERSONAL_LOAN: "Personal Loan", CUSTOM: "Custom" };
// Color reserved for actual gain/loss (matching the reference app's
// restraint) — categories that aren't inherently positive/negative stay
// neutral instead of borrowing the warning/amber token.
const RECV_COLORS: Record<string, string> = {
  INVESTMENT: "bg-positive-bg text-positive border border-positive-border",
  PERSONAL_LOAN: "bg-muted text-muted-foreground border border-border",
  CUSTOM: "bg-muted text-muted-foreground border border-border",
};

type MainTab = "chits" | "receivables";
type RecvTab = "pending" | "received";

// ── Main component ────────────────────────────────────────────────────────────

export function ReceivablesClient({ chits: initialChits, receivables: initialReceivables }: Props) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);

  const [chits, setChits]           = useState(initialChits);
  const [receivables, setReceivables] = useState(initialReceivables);
  const [mainTab, setMainTab]       = useState<MainTab>("chits");
  const [recvTab, setRecvTab]       = useState<RecvTab>("pending");

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
        desc="Track your chit funds and money owed to you, all in one place."
      />

      <PageHeader
        title="Vault"
        action={
          <>
            {mainTab === "chits"       && <Button size="sm" onClick={() => setShowAddChit(true)}       className="h-8 px-3 text-xs sm:h-9 sm:px-4 sm:text-sm"><Plus className="w-3.5 h-3.5 mr-1" />Add Chit</Button>}
            {mainTab === "receivables" && <Button size="sm" onClick={() => setShowAddReceivable(true)} className="h-8 px-3 text-xs sm:h-9 sm:px-4 sm:text-sm"><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>}
          </>
        }
      />

      <TabsUnderline value={mainTab} onChange={setMainTab} options={tabs} />

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
                                <span className="ml-1 text-xs font-normal text-muted-foreground">due {ordinal(chit.template.dueDateDay)}</span>
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
                              <span className="ml-1 text-xs font-normal text-muted-foreground">due {ordinal(chit.template.dueDateDay)}</span>
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
