"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, RefreshCw, Check, X, Landmark, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export type CCCard = { templateId: string; name: string };
export type CustomCat = { id: string; name: string };
export type PossibleMatch = { id: string; name: string; amount: number; date: string };
export type PaymentMethod = "CREDIT_CARD" | "UPI" | "DEBIT_CARD" | "OTHER";

export interface ParsedTransactionItem {
  id: string;
  bank: string;
  amount: number;
  merchant: string | null;
  last4: string | null;
  date: string;
  rawSnippet: string;
  paymentMethod: PaymentMethod;
  suggestedCcTemplateId: string | null;
  suggestedSubcategory: string | null;
  possibleMatch: PossibleMatch | null;
}

const EXPENSE_CATEGORIES = [
  { value: "HOUSE_MAINTENANCE", label: "House" },
  { value: "LOAN",              label: "Loan" },
  { value: "PERSONAL",          label: "Personal" },
  { value: "MISCELLANEOUS",     label: "Misc" },
];

// Must match CC_SUBCATEGORIES in src/components/dashboard/dashboard-client.tsx
const CC_SUBCATEGORIES = ["Food", "Coffee", "Groceries", "Fuel", "Shopping", "Travel", "Health", "Bills", "Entertainment", "Other"];

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CREDIT_CARD: "Credit Card",
  UPI: "UPI",
  DEBIT_CARD: "Debit Card",
  OTHER: "Other",
};

interface ImportsClientProps {
  gmail: {
    connected: boolean;
    connectedEmail: string | null;
    lastSyncAt: string | null;
    ccCards: CCCard[];
    customCategories: CustomCat[];
    pending: ParsedTransactionItem[];
  };
}

export function ImportsClient({ gmail }: ImportsClientProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ processed: number; total: number } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const grouped = useMemo(() => {
    const byDay = new Map<string, ParsedTransactionItem[]>();
    for (const item of gmail.pending) {
      const day = item.date.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(item);
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [gmail.pending]);

  async function handleSync() {
    setSyncing(true);
    setSyncProgress(null);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Sync failed");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let final: { type: string; synced?: number; error?: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.type === "progress") setSyncProgress({ processed: msg.processed, total: msg.total });
          else final = msg;
        }
      }

      if (!final || final.type === "error") {
        toast.error(final?.error ?? "Sync failed");
      } else {
        toast.success((final.synced ?? 0) > 0 ? `Found ${final.synced} new transaction${final.synced === 1 ? "" : "s"}` : "No new transactions");
        router.refresh();
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/gmail/disconnect", { method: "DELETE" });
      toast.success("Gmail disconnected");
      router.refresh();
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Bank Imports</h1>
        <p className="text-sm text-muted-foreground">Transactions found in your Gmail, ready to review</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4" /> Gmail connection
          </CardTitle>
          <CardDescription>
            Reads bank transaction alerts and suggests entries, nothing is added automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {gmail.connected ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Connected{gmail.connectedEmail ? ` as ${gmail.connectedEmail}` : ""}</p>
                <p className="text-xs text-muted-foreground">
                  {gmail.lastSyncAt ? `Last synced ${format(new Date(gmail.lastSyncAt), "d MMM, h:mm a")}` : "Not synced yet"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSync} disabled={syncing}>
                  <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", syncing && "animate-spin")} />
                  {syncing ? "Syncing..." : "Sync now"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
                  {disconnecting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </Button>
              </div>
              {syncing && (
                <div className="space-y-1">
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-zinc-900 transition-all duration-300 ease-out"
                      style={{
                        width: syncProgress
                          ? `${Math.round((syncProgress.processed / Math.max(syncProgress.total, 1)) * 100)}%`
                          : "6%",
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {syncProgress
                      ? `Checking email ${syncProgress.processed} of ${syncProgress.total}...`
                      : "Searching your inbox..."}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <Button size="sm" onClick={() => { window.location.href = "/api/gmail/connect"; }}>
              <Mail className="w-3.5 h-3.5 mr-1.5" />
              Connect Gmail
            </Button>
          )}
        </CardContent>
      </Card>

      {gmail.connected && grouped.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Nothing pending, you&apos;re all caught up.</p>
      )}

      {grouped.map(([day, items]) => (
        <div key={day} className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            {format(new Date(day), "EEEE, d MMM")}
          </p>
          {items.map(item => (
            <TransactionRow
              key={item.id}
              item={item}
              ccCards={gmail.ccCards}
              customCategories={gmail.customCategories}
              onDone={() => router.refresh()}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function TransactionRow({ item, ccCards, customCategories, onDone }: {
  item: ParsedTransactionItem;
  ccCards: CCCard[];
  customCategories: CustomCat[];
  onDone: () => void;
}) {
  const [addAnyway, setAddAnyway] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const showForm = !item.possibleMatch || addAnyway;

  async function handleDismiss() {
    setDismissing(true);
    try {
      await reject(item.id);
      toast.success("Dismissed");
      onDone();
    } catch {
      toast.error("Failed to dismiss");
      setDismissing(false);
    }
  }

  if (item.possibleMatch && !addAnyway) {
    return (
      <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{item.merchant ?? item.bank}</p>
            <p className="text-xs text-muted-foreground">{item.bank} · {METHOD_LABEL[item.paymentMethod]}{item.last4 && ` · •• ${item.last4}`}</p>
          </div>
          <p className="text-sm font-semibold">₹{item.amount.toLocaleString("en-IN")}</p>
        </div>
        <div className="text-xs text-muted-foreground bg-background rounded-md p-2 border border-border">
          Looks like you already added this: <span className="font-medium text-foreground">{item.possibleMatch.name}</span>, ₹{item.possibleMatch.amount.toLocaleString("en-IN")} on {format(new Date(item.possibleMatch.date), "d MMM")}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="default" onClick={() => setAddAnyway(true)} disabled={dismissing}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Not the same, add anyway
          </Button>
          <Button size="sm" variant="destructive" onClick={handleDismiss} disabled={dismissing}>
            {dismissing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1" />}
            {dismissing ? "Dismissing..." : "Dismiss"}
          </Button>
        </div>
      </div>
    );
  }

  return <AddForm item={item} ccCards={ccCards} customCategories={customCategories} onDone={onDone} showBack={showForm && !!item.possibleMatch} onBack={() => setAddAnyway(false)} />;
}

async function reject(id: string) {
  const res = await fetch(`/api/gmail/parsed/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reject" }),
  });
  if (!res.ok) throw new Error("Failed to dismiss");
}

function AddForm({ item, ccCards, customCategories, onDone, showBack, onBack }: {
  item: ParsedTransactionItem;
  ccCards: CCCard[];
  customCategories: CustomCat[];
  onDone: () => void;
  showBack: boolean;
  onBack: () => void;
}) {
  const isCC = item.paymentMethod === "CREDIT_CARD";
  const [ccTemplateId, setCCTemplateId] = useState(item.suggestedCcTemplateId ?? ccCards[0]?.templateId ?? "");
  const [spendCat, setSpendCat] = useState(item.suggestedSubcategory ?? "");
  const [category, setCategory] = useState("MISCELLANEOUS");
  const [customLabel, setCustomLabel] = useState("");
  const [amount, setAmount] = useState(String(item.amount));
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);
  const loading = pendingAction !== null;

  async function act(action: "approve" | "reject") {
    setPendingAction(action);
    try {
      const body: Record<string, unknown> = { action };
      if (action === "approve") {
        body.amount = parseFloat(amount);
        if (isCC) {
          body.ccTemplateId = ccTemplateId;
          if (spendCat) body.subcategory = spendCat;
        } else if (customLabel.trim()) {
          body.customCategory = customLabel.trim();
        } else {
          body.category = category;
        }
      }
      const res = await fetch(`/api/gmail/parsed/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Something went wrong");
      } else {
        toast.success(action === "approve" ? "Added" : "Dismissed");
        onDone();
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{item.merchant ?? item.bank}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Landmark className="w-3 h-3" /> {item.bank} · {METHOD_LABEL[item.paymentMethod]}{item.last4 && ` · •• ${item.last4}`}
          </p>
        </div>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="w-24 text-right text-sm font-semibold border border-border rounded-md px-2 py-1 bg-background"
        />
      </div>

      {isCC ? (
        <>
          {ccCards.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ccCards.map(card => (
                <button
                  key={card.templateId}
                  type="button"
                  onClick={() => setCCTemplateId(card.templateId)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                    ccTemplateId === card.templateId
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground",
                  )}
                >
                  {card.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {CC_SUBCATEGORIES.map(sub => (
              <button
                key={sub}
                type="button"
                onClick={() => setSpendCat(c => c === sub ? "" : sub)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  spendCat === sub
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground",
                )}
              >
                {sub}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {EXPENSE_CATEGORIES.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => { setCategory(c.value); setCustomLabel(""); }}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                category === c.value && !customLabel
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
          {customCategories.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCustomLabel(c.name)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                customLabel === c.name
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => act("approve")} disabled={loading || (isCC && !ccTemplateId)}>
          {pendingAction === "approve" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
          {pendingAction === "approve" ? "Adding..." : "Add"}
        </Button>
        <Button size="sm" variant="destructive" onClick={() => act("reject")} disabled={loading}>
          {pendingAction === "reject" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1" />}
          {pendingAction === "reject" ? "Rejecting..." : "Reject"}
        </Button>
        {showBack && (
          <Button size="sm" variant="ghost" onClick={onBack} disabled={loading}>
            Back to match
          </Button>
        )}
      </div>
    </div>
  );
}
