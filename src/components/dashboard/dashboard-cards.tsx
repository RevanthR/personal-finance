"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import type { CardOverview } from "@/components/cards/cards-client";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  return Math.round((new Date(iso).getTime() - today.getTime()) / 86400000);
}

const STATUS: Record<CardOverview["status"]["status"], { label: string; tone: string }> = {
  unconfigured: { label: "Set up", tone: "bg-muted text-muted-foreground" },
  open: { label: "Spending", tone: "bg-muted text-muted-foreground" },
  awaiting: { label: "Confirm", tone: "bg-warning-bg text-warning" },
  confirmed: { label: "Due", tone: "bg-warning-bg text-warning" },
  paid: { label: "Paid", tone: "bg-positive-bg text-positive" },
  pastdue: { label: "Past due", tone: "bg-negative-bg text-negative" },
};

function CardRow({ card, fmt }: { card: CardOverview; fmt: (v: number) => string }) {
  const router = useRouter();
  const s = card.status;
  const [busy, setBusy] = useState(false);
  const meta = STATUS[s.status];
  const dueDays = daysUntil(s.paymentDueDate);

  async function post(path: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(`/api/cards/${card.cardId}/${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? "Something went wrong"); return; }
      router.refresh();
    } finally { setBusy(false); }
  }

  const headline =
    s.status === "awaiting" ? { label: "Statement", value: s.statementEstimated, note: "estimated" }
    : s.status === "paid" ? { label: "Statement", value: 0, note: "paid" }
    : s.status === "open" || s.status === "unconfigured" ? { label: "This cycle", value: s.unbilledSpends, note: "" }
    : { label: "Now owed", value: s.statementBalance, note: s.statementConfirmed ? "confirmed" : "estimated" };

  return (
    <div className={cn("rounded-xl border bg-card p-3", s.status === "pastdue" && "border-negative/40")}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{card.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {headline.label}
            {s.paymentDueDate && s.status !== "paid" && s.status !== "open" && (
              <> · due {fmtDate(s.paymentDueDate)}{dueDays != null && ` (${dueDays < 0 ? `${-dueDays}d late` : dueDays === 0 ? "today" : `${dueDays}d`})`}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold tabular-nums">{headline.value > 0 || headline.label !== "This cycle" ? fmt(Math.round(headline.value)) : fmt(0)}</span>
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", meta.tone)}>{meta.label}</span>
        </div>
      </div>

      {(s.status === "open" || s.status === "confirmed" || s.status === "pastdue" || s.status === "awaiting") && s.unbilledSpends > 0 && s.status !== "open" && (
        <p className="text-[11px] text-muted-foreground mt-1.5">+{fmt(Math.round(s.unbilledSpends))} spent this cycle</p>
      )}

      {s.status === "awaiting" && (
        <Button size="sm" className="w-full h-8 text-xs mt-2" disabled={busy}
          onClick={() => post("confirm", { statementBalance: Math.round(s.statementEstimated) })}>
          Confirm {fmt(Math.round(s.statementEstimated))}
        </Button>
      )}
      {(s.status === "confirmed" || s.status === "pastdue") && s.statementBalance > 0 && (
        <Button size="sm" className="w-full h-8 text-xs mt-2" disabled={busy} onClick={() => post("pay", { full: true })}>
          Mark paid ({fmt(Math.round(s.statementBalance))})
        </Button>
      )}
    </div>
  );
}

export function DashboardCards({ cards, fmt }: { cards: CardOverview[]; fmt: (v: number) => string }) {
  const active = cards.filter(c => c.isActive);
  if (active.length === 0) return null;

  // Cards that need a look sort first.
  const rank = (c: CardOverview) => ({ pastdue: 0, awaiting: 1, confirmed: 2, open: 3, unconfigured: 3, paid: 4 }[c.status.status]);
  const sorted = [...active].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-0.5">
        <p className="fin-label">Cards</p>
        <Link href="/cards" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5">
          All cards <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {sorted.map(card => <CardRow key={card.cardId} card={card} fmt={fmt} />)}
    </div>
  );
}
