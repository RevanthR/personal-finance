"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Plus, TrendingUp, TrendingDown, Wallet, Clock, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AddChitDialog } from "@/components/chits/add-chit-dialog";
import { LiftChitDialog } from "@/components/chits/lift-chit-dialog";
import { AddReceivableDialog } from "./add-receivable-dialog";
import { MarkReceivedDialog } from "./mark-received-dialog";

type Chit = {
  id: string;
  totalValue: number;
  durationMonths: number;
  startDate: string;
  monthlyUnliftedAmount: number;
  monthlyLiftedAmount: number | null;
  isLifted: boolean;
  liftedOn: string | null;
  liftedAmount: number | null;
  liftedUsedFor: string | null;
  accumulatedSavings: number;
  endDate: string | null;
  template: { id: string; name: string; isActive: boolean };
};

type Receivable = {
  id: string;
  category: "INVESTMENT" | "PERSONAL_LOAN" | "CUSTOM";
  customCategory: string | null;
  description: string;
  expectedAmount: number;
  expectedDate: string | null;
  status: "PENDING" | "RECEIVED";
  receivedAmount: number | null;
  receivedDate: string | null;
  createdAt: string;
};

interface ReceivablesClientProps {
  chits: Chit[];
  receivables: Receivable[];
}

const CATEGORY_LABELS: Record<string, string> = {
  INVESTMENT: "Investment",
  PERSONAL_LOAN: "Personal Loan",
  CUSTOM: "Custom",
};

const CATEGORY_COLORS: Record<string, string> = {
  INVESTMENT: "bg-blue-100 text-blue-700",
  PERSONAL_LOAN: "bg-orange-100 text-orange-700",
  CUSTOM: "bg-purple-100 text-purple-700",
  CHIT_FUND: "bg-amber-100 text-amber-700",
};

type Tab = "pending" | "received";

export function ReceivablesClient({ chits: initialChits, receivables: initialReceivables }: ReceivablesClientProps) {
  const [chits, setChits] = useState(initialChits);
  const [receivables, setReceivables] = useState(initialReceivables);
  const [tab, setTab] = useState<Tab>("pending");
  const [showAddChit, setShowAddChit] = useState(false);
  const [showAddReceivable, setShowAddReceivable] = useState(false);
  const [liftingChit, setLiftingChit] = useState<Chit | null>(null);
  const [receivingItem, setReceivingItem] = useState<Receivable | null>(null);

  const unliftedChits = chits.filter((c) => !c.isLifted && c.template.isActive);
  const liftedChits = chits.filter((c) => c.isLifted);
  const pendingReceivables = receivables.filter((r) => r.status === "PENDING");
  const receivedReceivables = receivables.filter((r) => r.status === "RECEIVED");

  const totalPending =
    unliftedChits.reduce((s, c) => s + c.accumulatedSavings, 0) +
    pendingReceivables.reduce((s, r) => s + r.expectedAmount, 0);

  // ── Chit handlers ──────────────────────────────────────────────────────────

  async function handleAddChit(data: {
    name: string;
    totalValue: number;
    durationMonths: number;
    startDate: string;
    monthlyUnliftedAmount: number;
    monthlyLiftedAmount?: number;
    dueDateDay?: number;
  }) {
    const res = await fetch("/api/chits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { toast.error("Failed to add chit"); return; }
    const newChit = await res.json();
    setChits((prev) => [...prev, newChit]);
    toast.success("Chit fund added");
    setShowAddChit(false);
  }

  async function handleLift(chitId: string, data: {
    liftedAmount: number;
    liftedUsedFor: string;
    monthlyLiftedAmount: number;
    liftMonth: number;
    liftYear: number;
  }) {
    const res = await fetch(`/api/chits/${chitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isLifted: true, ...data }),
    });
    if (!res.ok) { toast.error("Failed to lift chit"); return; }
    const updated = await res.json();
    setChits((prev) => prev.map((c) => (c.id === chitId ? updated : c)));
    toast.success("Chit lifted — income recorded");
    setLiftingChit(null);
  }

  // ── Receivable handlers ────────────────────────────────────────────────────

  async function handleAddReceivable(data: {
    category: "INVESTMENT" | "PERSONAL_LOAN" | "CUSTOM";
    customCategory?: string;
    description: string;
    expectedAmount: number;
    expectedDate?: string;
  }) {
    const res = await fetch("/api/receivables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { toast.error("Failed to add receivable"); return; }
    const newR = await res.json();
    setReceivables((prev) => [newR, ...prev]);
    toast.success("Receivable added");
    setShowAddReceivable(false);
  }

  async function handleMarkReceived(id: string, data: {
    receivedAmount: number;
    receivedMonth: number;
    receivedYear: number;
    receivedDate: string;
  }) {
    const res = await fetch(`/api/receivables/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "RECEIVED", ...data }),
    });
    if (!res.ok) { toast.error("Failed to mark as received"); return; }
    const updated = await res.json();
    setReceivables((prev) => prev.map((r) => (r.id === id ? updated : r)));
    toast.success("Marked as received — income recorded");
    setReceivingItem(null);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/receivables/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
    setReceivables((prev) => prev.filter((r) => r.id !== id));
    toast.success("Removed");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Receivables</h1>
          <p className="text-sm text-muted-foreground">
            {unliftedChits.length + pendingReceivables.length} pending · {formatCurrency(totalPending)} expected
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddChit(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Chit
          </Button>
          <Button size="sm" onClick={() => setShowAddReceivable(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Receivable
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Unlifted Chits</p>
            <p className="text-2xl font-bold">{unliftedChits.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Chit Savings</p>
            <p className="text-2xl font-bold text-amber-600">
              {formatCurrency(unliftedChits.reduce((s, c) => s + c.accumulatedSavings, 0))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Other Pending</p>
            <p className="text-2xl font-bold">{pendingReceivables.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Other Expected</p>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(pendingReceivables.reduce((s, r) => s + r.expectedAmount, 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {(["pending", "received"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "pending" ? (
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Pending</span>
            ) : (
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Received</span>
            )}
          </button>
        ))}
      </div>

      {/* Pending tab */}
      {tab === "pending" && (
        <div className="space-y-6">
          {/* Unlifted chits */}
          {unliftedChits.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Chit Funds
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {unliftedChits.map((chit) => {
                  const pct = Math.min(100, Math.round((chit.accumulatedSavings / chit.totalValue) * 100));
                  return (
                    <Card key={chit.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{chit.template.name}</CardTitle>
                          <Badge className={`text-xs ${CATEGORY_COLORS.CHIT_FUND} border-0`}>
                            <TrendingUp className="w-3 h-3 mr-1" /> Chit Fund
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Total Value</p>
                            <p className="font-semibold">{formatCurrency(chit.totalValue)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Accumulated</p>
                            <p className="font-semibold text-amber-600">
                              {formatCurrency(chit.accumulatedSavings)} ({pct}%)
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Monthly</p>
                            <p className="font-semibold">{formatCurrency(chit.monthlyUnliftedAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Started</p>
                            <p className="font-semibold">{format(new Date(chit.startDate), "MMM yyyy")}</p>
                          </div>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setLiftingChit(chit)}
                        >
                          Mark as Lifted
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Other pending receivables */}
          {pendingReceivables.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Other Receivables
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {pendingReceivables.map((r) => (
                  <Card key={r.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{r.description}</CardTitle>
                        <Badge className={`text-xs ${CATEGORY_COLORS[r.category]} border-0`}>
                          {r.customCategory ?? CATEGORY_LABELS[r.category]}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Expected</p>
                          <p className="font-semibold text-green-600">{formatCurrency(r.expectedAmount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Due By</p>
                          <p className="font-semibold">
                            {r.expectedDate ? format(new Date(r.expectedDate), "dd MMM yyyy") : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          onClick={() => setReceivingItem(r)}
                        >
                          <Wallet className="w-3.5 h-3.5 mr-1" /> Mark Received
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(r.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {unliftedChits.length === 0 && pendingReceivables.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
              <p>No pending receivables. Add a chit fund or receivable to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Received tab */}
      {tab === "received" && (
        <div className="space-y-6">
          {/* Lifted chits */}
          {liftedChits.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Lifted Chits
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {liftedChits.map((chit) => (
                  <Card key={chit.id} className="opacity-80">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{chit.template.name}</CardTitle>
                        <Badge variant="destructive" className="text-xs">
                          <TrendingDown className="w-3 h-3 mr-1" /> Lifted
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Amount Received</p>
                          <p className="font-semibold">{formatCurrency(chit.liftedAmount ?? 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Lifted On</p>
                          <p className="font-semibold">
                            {chit.liftedOn ? format(new Date(chit.liftedOn), "MMM yyyy") : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Monthly (now)</p>
                          <p className="font-semibold">{formatCurrency(chit.monthlyLiftedAmount ?? 0)}</p>
                        </div>
                      </div>
                      {chit.liftedUsedFor && (
                        <p className="text-xs text-muted-foreground bg-muted rounded p-2">
                          Used for: {chit.liftedUsedFor}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Received receivables */}
          {receivedReceivables.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Received
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {receivedReceivables.map((r) => (
                  <Card key={r.id} className="opacity-80">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{r.description}</CardTitle>
                        <Badge className="text-xs bg-green-100 text-green-700 border-0">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Received
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Amount Received</p>
                          <p className="font-semibold text-green-600">{formatCurrency(r.receivedAmount ?? r.expectedAmount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Received On</p>
                          <p className="font-semibold">
                            {r.receivedDate ? format(new Date(r.receivedDate), "dd MMM yyyy") : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Expected</p>
                          <p className="font-semibold text-muted-foreground">{formatCurrency(r.expectedAmount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Category</p>
                          <p className="font-semibold">{r.customCategory ?? CATEGORY_LABELS[r.category]}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {liftedChits.length === 0 && receivedReceivables.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
              <p>Nothing received yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <AddChitDialog open={showAddChit} onOpenChange={setShowAddChit} onAdd={handleAddChit} />
      <AddReceivableDialog open={showAddReceivable} onOpenChange={setShowAddReceivable} onAdd={handleAddReceivable} />

      {liftingChit && (
        <LiftChitDialog
          open={!!liftingChit}
          onOpenChange={(o) => !o && setLiftingChit(null)}
          chit={liftingChit}
          onLift={(data) => handleLift(liftingChit.id, data)}
        />
      )}

      {receivingItem && (
        <MarkReceivedDialog
          open={!!receivingItem}
          onOpenChange={(o) => !o && setReceivingItem(null)}
          receivable={receivingItem}
          onConfirm={(data) => handleMarkReceived(receivingItem.id, data)}
        />
      )}
    </div>
  );
}
