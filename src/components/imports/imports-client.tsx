"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Mail, RefreshCw, Check, X, Landmark, Plus, Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export type CCCard = { templateId: string; name: string };
export type CustomCat = { id: string; name: string };
export type PossibleMatch = { id: string; name: string; amount: number; date: string };
export type MatchedEntry = { kind: "cc" | "recurring"; entryId: string; templateId: string; templateName: string; owed: number; alreadyPaid: number };
export type PaymentMethod = "CREDIT_CARD" | "UPI" | "DEBIT_CARD" | "OTHER";
export type TransactionType = "DEBIT" | "CREDIT" | "REFUND";

export interface ParsedTransactionItem {
  id: string;
  bank: string;
  amount: number;
  originalCurrency: string | null;
  originalAmount: number | null;
  merchant: string | null;
  last4: string | null;
  date: string;
  transactionTime: string | null;
  emailReceivedAt: string | null;
  rawSnippet: string;
  paymentMethod: PaymentMethod;
  transactionType: TransactionType;
  suggestedCcTemplateId: string | null;
  suggestedSubcategory: string | null;
  possibleMatch: PossibleMatch | null;
  matchedEntry: MatchedEntry | null;
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

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", AUD: "A$", CAD: "C$", SGD: "S$", AED: "AED " };

// Prefers a time the email explicitly stated for the transaction itself;
// falls back to when the email arrived (a proxy, not the real transaction
// time, so callers should mark it visually distinct) when Gemini couldn't
// find one stated.
function getDisplayTime(item: ParsedTransactionItem): { label: string; exact: boolean } | null {
  if (item.transactionTime && /^\d{1,2}:\d{2}$/.test(item.transactionTime)) {
    const [h, m] = item.transactionTime.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return { label: format(d, "h:mm a"), exact: true };
  }
  if (item.emailReceivedAt) {
    return { label: format(new Date(item.emailReceivedAt), "h:mm a"), exact: false };
  }
  return null;
}

function TimeNote({ item }: { item: ParsedTransactionItem }) {
  const t = getDisplayTime(item);
  if (!t) return null;
  return <> · {t.exact ? t.label : `~${t.label} (email time)`}</>;
}

function FxEstimateNote({ item }: { item: ParsedTransactionItem }) {
  if (!item.originalCurrency || item.originalCurrency === "INR" || !item.originalAmount) return null;
  const symbol = CURRENCY_SYMBOLS[item.originalCurrency] ?? `${item.originalCurrency} `;
  return (
    <p className="text-xs text-warning bg-warning-bg border border-warning-border rounded-md px-2 py-1 mt-1">
      {symbol}{item.originalAmount.toLocaleString()} {item.originalCurrency} → ≈ ₹{item.amount.toLocaleString("en-IN")} (estimated, confirm against your statement)
    </p>
  );
}

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

  // Live-refresh (polling + focus/visibility) now lives in Sidebar, since
  // it's present on every page and this page is rendered inside it — no
  // need for a second, redundant effect here.

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
    <div className="space-y-6">
      <PageHeader title="Sync" subtitle="Transactions found in your Gmail, ready to review" />

      {/* A horizontal bar, not a narrow stacked card — the connection status,
          last-synced note, and actions all sit in one row so the card uses
          the page's full width instead of being capped at a fixed width
          with the rest of the row left blank. */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {gmail.connected ? `Connected${gmail.connectedEmail ? ` as ${gmail.connectedEmail}` : ""}` : "Gmail not connected"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {gmail.connected
                    ? gmail.lastSyncAt ? `Last synced ${format(new Date(gmail.lastSyncAt), "d MMM, h:mm a")}` : "Not synced yet"
                    : "Reads bank transaction alerts and suggests entries, nothing is added automatically."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              {gmail.connected ? (
                <>
                  <Button size="sm" onClick={handleSync} disabled={syncing}>
                    <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", syncing && "animate-spin")} />
                    {syncing ? "Syncing..." : "Sync now"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
                    {disconnecting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    {disconnecting ? "Disconnecting..." : "Disconnect"}
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => { window.location.href = "/api/gmail/connect"; }}>
                  <Mail className="w-3.5 h-3.5 mr-1.5" />
                  Connect Gmail
                </Button>
              )}
            </div>
          </div>

          {syncing && (
            <div className="space-y-1 mt-3">
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
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
        </CardContent>
      </Card>

      {gmail.connected && grouped.length === 0 && (
        <EmptyState icon={Inbox} title="Nothing pending" description="You're all caught up." />
      )}

      {grouped.map(([day, items]) => (
        <div key={day} className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            {format(new Date(day), "EEEE, d MMM")}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
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
  const [settling, setSettling] = useState(false);
  const hasSuggestion = !!item.possibleMatch || !!item.matchedEntry;

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

  async function handleSettle() {
    if (!item.matchedEntry) return;
    setSettling(true);
    try {
      const res = await fetch(`/api/gmail/parsed/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settle", entryId: item.matchedEntry.entryId, amount: item.amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to mark as paid");
        setSettling(false);
        return;
      }
      toast.success("Marked as paid");
      onDone();
    } catch {
      toast.error("Failed to mark as paid");
      setSettling(false);
    }
  }

  if (item.possibleMatch && !addAnyway) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item.merchant ?? item.bank}</p>
              <p className="text-xs text-muted-foreground">{item.bank} · {METHOD_LABEL[item.paymentMethod]}{item.last4 && ` · •• ${item.last4}`}<TimeNote item={item} /></p>
            </div>
            <p className="text-sm font-semibold shrink-0">₹{item.amount.toLocaleString("en-IN")}</p>
          </div>
          <FxEstimateNote item={item} />
          <div className="text-xs text-muted-foreground bg-background rounded-md p-2 border border-border break-words">
            Looks like you already added this: <span className="font-medium text-foreground">{item.possibleMatch.name}</span>, ₹{item.possibleMatch.amount.toLocaleString("en-IN")} on {format(new Date(item.possibleMatch.date), "d MMM")}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="default" onClick={() => setAddAnyway(true)} disabled={dismissing}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Not the same, add anyway
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDismiss} disabled={dismissing}>
              {dismissing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1" />}
              {dismissing ? "Dismissing..." : "Dismiss"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (item.matchedEntry && !addAnyway) {
    const { templateName, owed, alreadyPaid } = item.matchedEntry;
    const outstanding = owed - alreadyPaid;
    const overBy = item.amount - outstanding;
    const isOverpayment = overBy > 0.5;
    const isFullPayment = overBy >= -0.5;
    return (
      <Card className="bg-accent/40">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item.merchant ?? item.bank}</p>
              <p className="text-xs text-muted-foreground">{item.bank} · {METHOD_LABEL[item.paymentMethod]}{item.last4 && ` · •• ${item.last4}`}<TimeNote item={item} /></p>
            </div>
            <p className="text-sm font-semibold shrink-0">₹{item.amount.toLocaleString("en-IN")}</p>
          </div>
          <div className="text-xs text-muted-foreground bg-background rounded-md p-2 border border-border break-words">
            Looks like a payment toward <span className="font-medium text-foreground">{templateName}</span> — ₹{outstanding.toLocaleString("en-IN")} owed
            {alreadyPaid > 0 ? `, ₹${alreadyPaid.toLocaleString("en-IN")} already paid` : ""}.
            {isOverpayment && ` Pays it off with ₹${overBy.toLocaleString("en-IN")} extra, credited toward next month's bill.`}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="default" onClick={handleSettle} disabled={settling}>
              {settling ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
              {settling ? "Marking..." : isFullPayment ? "Mark as paid" : "Record partial payment"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAddAnyway(true)} disabled={settling}>
              Not this, add as new expense
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <AddForm item={item} ccCards={ccCards} customCategories={customCategories} onDone={onDone} showBack={hasSuggestion && addAnyway} onBack={() => setAddAnyway(false)} />;
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
  const isIncome = item.transactionType === "CREDIT" || item.transactionType === "REFUND";
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
          if (!isIncome && spendCat) body.subcategory = spendCat;
        } else if (!isIncome) {
          if (customLabel.trim()) body.customCategory = customLabel.trim();
          else body.category = category;
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
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{item.merchant ?? item.bank}</p>
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Landmark className="w-3 h-3 shrink-0 mt-0.5" /> <span>{item.bank} · {METHOD_LABEL[item.paymentMethod]}{item.last4 && ` · •• ${item.last4}`}<TimeNote item={item} /></span>
            </p>
          </div>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-20 sm:w-24 shrink-0 text-right text-sm font-semibold border border-border rounded-md px-2 py-1 bg-background"
          />
        </div>

        <FxEstimateNote item={item} />

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
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                    )}
                  >
                    {card.name}
                  </button>
                ))}
              </div>
            )}
            {isIncome ? (
              <p className="text-xs text-warning bg-warning-bg border border-warning-border rounded-md px-2 py-1">
                Looks like a refund or credit — this will reduce the card&apos;s bill instead of adding a charge.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {CC_SUBCATEGORIES.map(sub => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setSpendCat(c => c === sub ? "" : sub)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      spendCat === sub
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                    )}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : isIncome ? (
          <p className="text-xs text-warning bg-warning-bg border border-warning-border rounded-md px-2 py-1">
            Looks like a credit or refund — this will be added as income (Other Income) instead of an expense.
          </p>
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
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
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
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
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
      </CardContent>
    </Card>
  );
}
