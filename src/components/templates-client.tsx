"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  formatCurrency, CATEGORY_LABELS, getCategoryDisplay, getCategoryColor, cn,
} from "@/lib/utils";
import { Plus, Pencil, Trash2, Lock, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ForecloseDialog } from "@/components/templates/foreclose-dialog";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type Template = {
  id: string;
  name: string;
  category: string;
  customCategory: string | null;
  amount: number;
  isFixed: boolean;
  dueDateDay: number | null;
  isActive: boolean;
  foreClosedOn: string | null;
  foreCloseAmount: number | null;
  pendingAmount: number | null;
  pendingFromMonth: number | null;
  pendingFromYear: number | null;
  statementDay: number | null;
  frequency: string;
  dueMonth: number | null;
  sortOrder: number;
};

type SaveData = {
  name: string;
  category: string;
  customCategory?: string;
  amount: number;
  isFixed: boolean;
  dueDateDay?: number;
  statementDay?: number | null;
  frequency?: string;
  dueMonth?: number | null;
  updateCurrentMonth?: boolean;
  pendingAmount?: number | null;
  pendingFromMonth?: number | null;
  pendingFromYear?: number | null;
  clearPending?: boolean;
};

export function TemplatesClient({ templates: initial }: { templates: Template[] }) {
  const [templates, setTemplates] = useState(initial);
  const [editing, setEditing] = useState<Template | null>(null);
  const [foreclosing, setForeclosing] = useState<Template | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  async function toggleActive(t: Template) {
    const res = await fetch(`/api/templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    if (!res.ok) { toast.error("Failed"); return; }
    setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, isActive: !x.isActive } : x));
  }

  async function saveEdit(data: SaveData) {
    if (!editing) return;
    const res = await fetch(`/api/templates/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { toast.error("Failed to save"); return; }
    const resolved: Template = {
      ...editing,
      ...data,
      customCategory: data.customCategory ?? null,
      category: data.customCategory ? "MISCELLANEOUS" : data.category,
      pendingAmount: data.clearPending ? null : (data.pendingAmount ?? editing.pendingAmount),
      pendingFromMonth: data.clearPending ? null : (data.pendingFromMonth ?? editing.pendingFromMonth),
      pendingFromYear: data.clearPending ? null : (data.pendingFromYear ?? editing.pendingFromYear),
      statementDay: data.statementDay ?? editing.statementDay,
      frequency: data.frequency ?? editing.frequency,
      dueMonth: data.dueMonth !== undefined ? data.dueMonth : editing.dueMonth,
    };
    setTemplates((prev) => prev.map((x) => x.id === editing.id ? resolved : x));
    toast.success("Template updated");
    setEditing(null);
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template? It won't affect past entries.")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    setTemplates((prev) => prev.filter((x) => x.id !== id));
    toast.success("Deleted");
  }

  async function handleForeclose(data: {
    foreClosedOn: string;
    foreCloseAmount: number;
    note: string;
    addToCurrentMonth: boolean;
  }) {
    if (!foreclosing) return;
    const res = await fetch(`/api/templates/${foreclosing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isActive: false,
        foreClosedOn: data.foreClosedOn,
        foreCloseAmount: data.foreCloseAmount,
        note: data.note,
        addToCurrentMonth: data.addToCurrentMonth,
      }),
    });
    if (!res.ok) { toast.error("Failed to foreclose"); return; }
    setTemplates((prev) => prev.map((t) =>
      t.id === foreclosing.id
        ? { ...t, isActive: false, foreClosedOn: data.foreClosedOn, foreCloseAmount: data.foreCloseAmount }
        : t
    ));
    toast.success(`${foreclosing.name} marked as foreclosed`);
    setForeclosing(null);
  }

  async function addTemplate(data: SaveData) {
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { toast.error("Failed to add"); return; }
    const t = await res.json();
    setTemplates((prev) => [...prev, t]);
    toast.success("Template added");
    setShowAdd(false);
  }

  const grouped = templates.reduce<Record<string, Template[]>>((acc, t) => {
    const key = t.customCategory ?? t.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recurring Templates</h1>
          <p className="text-sm text-muted-foreground">
            {templates.filter((t) => t.isActive).length} active · auto-populate each month
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add Template
        </Button>
      </div>

      {Object.entries(grouped).map(([key, items]) => {
        const first = items[0];
        const displayLabel = getCategoryDisplay(first.category, first.customCategory);
        const color = getCategoryColor(first.category, first.customCategory);
        return (
          <div key={key}>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {displayLabel}
              </h2>
            </div>
            <div className="space-y-2">
              {items.map((t) => {
                const isClosed = !!t.foreClosedOn;
                const hasPending = !isClosed && t.pendingAmount != null && t.pendingFromMonth != null && t.pendingFromYear != null;
                const pendingDir = hasPending && t.pendingAmount! > t.amount ? "↑" : "↓";
                return (
                  <Card key={t.id} className={cn(!t.isActive && !isClosed ? "opacity-50" : "")}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: isClosed ? "#d1d5db" : color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          {!t.isFixed && !isClosed && <Badge variant="outline" className="text-xs">Variable</Badge>}
                          {t.frequency === "YEARLY" && !isClosed && (
                            <Badge className="text-xs bg-violet-50 text-violet-700 hover:bg-violet-50 border border-violet-200">
                              Yearly{t.dueMonth ? ` · ${MONTHS[t.dueMonth - 1]}` : ""}
                            </Badge>
                          )}
                          {t.dueDateDay && !isClosed && (
                            <Badge variant="secondary" className="text-xs">Due {t.dueDateDay}th</Badge>
                          )}
                          {isClosed && (
                            <Badge className="text-xs bg-zinc-100 text-zinc-500 hover:bg-zinc-100 border-0">
                              Closed · {format(new Date(t.foreClosedOn!), "MMM yyyy")}
                            </Badge>
                          )}
                          {hasPending && (
                            <Badge className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-50 border border-amber-200">
                              {pendingDir} {formatCurrency(t.pendingAmount!)} from {MONTHS[(t.pendingFromMonth! - 1)]} {t.pendingFromYear}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {isClosed && t.foreCloseAmount
                            ? `Settled ${formatCurrency(t.foreCloseAmount)}`
                            : `${formatCurrency(t.amount)}/${t.frequency === "YEARLY" ? "year" : "month"}`}
                          {!isClosed && t.category === "CREDIT_CARD" && (t.statementDay || t.dueDateDay) && (
                            <span className="ml-1.5 text-blue-500">
                              {t.statementDay ? `· closes ${t.statementDay}th` : ""}
                              {t.dueDateDay ? ` · due ${t.dueDateDay}th` : ""}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isClosed ? (
                          <button onClick={() => deleteTemplate(t.id)} className="text-muted-foreground hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <>
                            {t.category !== "CHIT_FUND" && t.isActive && (
                              <button
                                onClick={() => setForeclosing(t)}
                                title="Foreclose"
                                className="text-muted-foreground hover:text-zinc-700"
                              >
                                <Lock className="w-4 h-4" />
                              </button>
                            )}
                            <Switch checked={t.isActive} onCheckedChange={() => toggleActive(t)} />
                            <button onClick={() => setEditing(t)} className="text-muted-foreground hover:text-foreground">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteTemplate(t.id)} className="text-muted-foreground hover:text-red-600">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {editing && (
        <TemplateDialog
          open
          title="Edit Template"
          initial={editing}
          onOpenChange={(v) => !v && setEditing(null)}
          onSave={saveEdit}
        />
      )}

      {foreclosing && (
        <ForecloseDialog
          open
          onOpenChange={(v) => !v && setForeclosing(null)}
          template={foreclosing}
          onForeclose={handleForeclose}
        />
      )}

      <TemplateDialog
        open={showAdd}
        title="Add Template"
        onOpenChange={setShowAdd}
        onSave={addTemplate}
      />
    </div>
  );
}

const CATEGORY_CHIPS = Object.entries(CATEGORY_LABELS).filter(([k]) => k !== "MISCELLANEOUS");

function TemplateDialog({
  open, title, initial, onOpenChange, onSave,
}: {
  open: boolean;
  title: string;
  initial?: Partial<Template>;
  onOpenChange: (v: boolean) => void;
  onSave: (data: SaveData) => Promise<void>;
}) {
  const isEditing = !!initial?.id;
  const isExistingCustom = !!initial?.customCategory;
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(isExistingCustom ? "__custom__" : (initial?.category ?? ""));
  const [customLabel, setCustomLabel] = useState(initial?.customCategory ?? "");
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [isFixed, setIsFixed] = useState(initial?.isFixed ?? true);
  const [dueDateDay, setDueDateDay] = useState(String(initial?.dueDateDay ?? ""));
  const [statementDay, setStatementDay] = useState(String(initial?.statementDay ?? ""));
  const [frequency, setFrequency] = useState<"MONTHLY" | "YEARLY">(
    (initial?.frequency as "MONTHLY" | "YEARLY") ?? "MONTHLY"
  );
  const [dueMonth, setDueMonth] = useState<number | null>(initial?.dueMonth ?? null);
  const [loading, setLoading] = useState(false);

  // Part 1: apply to current month
  const [updateCurrentMonth, setUpdateCurrentMonth] = useState(false);

  // Part 2: scheduled future change
  const [showSchedule, setShowSchedule] = useState(
    isEditing && initial?.pendingAmount != null
  );
  const nextMonth = (() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  })();
  const [pendingAmt, setPendingAmt] = useState(
    initial?.pendingAmount != null ? String(initial.pendingAmount) : ""
  );
  const [pendingMonth, setPendingMonth] = useState(
    initial?.pendingFromMonth ?? nextMonth.month
  );
  const [pendingYear, setPendingYear] = useState(
    initial?.pendingFromYear ?? nextMonth.year
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    setLoading(true);
    const isCustom = category === "__custom__";

    const pendingValid = showSchedule && pendingAmt && parseFloat(pendingAmt) > 0;

    await onSave({
      name,
      category: isCustom ? "MISCELLANEOUS" : category,
      customCategory: isCustom && customLabel ? customLabel : undefined,
      amount: parseFloat(amount),
      isFixed,
      dueDateDay: dueDateDay ? parseInt(dueDateDay) : undefined,
      statementDay: statementDay ? parseInt(statementDay) : null,
      frequency,
      dueMonth: frequency === "YEARLY" ? dueMonth : null,
      ...(isEditing && { updateCurrentMonth }),
      ...(pendingValid && {
        pendingAmount: parseFloat(pendingAmt),
        pendingFromMonth: pendingMonth,
        pendingFromYear: pendingYear,
      }),
      ...(!showSchedule && isEditing && initial?.pendingAmount != null && { clearPending: true }),
    });
    setLoading(false);
  }

  const isCustom = category === "__custom__";
  const isValid = name && category && (!isCustom || customLabel) && amount && (frequency === "MONTHLY" || dueMonth !== null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div>
            <Label className="text-xs mb-2 block">Category</Label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_CHIPS.map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCategory(k)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                    category === k
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground"
                  )}
                >
                  {v}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCategory("__custom__")}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  isCustom
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "border-dashed border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground"
                )}
              >
                + Custom
              </button>
            </div>
            {isCustom && (
              <Input
                className="mt-2"
                placeholder="Category name (e.g. Insurance)"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                autoFocus
                required={isCustom}
              />
            )}
          </div>

          <div>
            <Label className="text-xs">
              {isEditing ? "Current amount (₹)" : "Default Amount (₹)"}
            </Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>

          {/* Part 1: apply change to current month */}
          {isEditing && (
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/30">
              <Label className="text-xs cursor-pointer">Also update this month's entry</Label>
              <Switch checked={updateCurrentMonth} onCheckedChange={setUpdateCurrentMonth} />
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="text-xs">Fixed Amount</Label>
            <Switch checked={isFixed} onCheckedChange={setIsFixed} />
          </div>

          {/* Frequency */}
          <div>
            <Label className="text-xs mb-2 block">Frequency</Label>
            <div className="flex gap-2">
              {(["MONTHLY", "YEARLY"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    frequency === f
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground"
                  )}
                >
                  {f === "MONTHLY" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
          </div>

          {frequency === "YEARLY" && (
            <div>
              <Label className="text-xs mb-2 block">Due month</Label>
              <div className="flex flex-wrap gap-1.5">
                {MONTHS.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDueMonth(i + 1)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      dueMonth === i + 1
                        ? "bg-zinc-900 text-white border-zinc-900"
                        : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Due Date (day of month, optional)</Label>
            <Input type="number" min="1" max="31" value={dueDateDay} onChange={(e) => setDueDateDay(e.target.value)} placeholder="e.g. 21" />
          </div>

          {category === "CREDIT_CARD" && (
            <div>
              <Label className="text-xs">Statement closes on (day of month, optional)</Label>
              <Input type="number" min="1" max="31" value={statementDay} onChange={(e) => setStatementDay(e.target.value)} placeholder="e.g. 15" />
              {statementDay && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Charges on/before {statementDay}th → this month's bill · charges after → next month
                </p>
              )}
            </div>
          )}

          {/* Part 2: schedule a future amount change */}
          {isEditing && (
            <div className="border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSchedule(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <span>{showSchedule ? "Scheduled amount change" : "Schedule a future amount change"}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", showSchedule && "rotate-180")} />
              </button>

              {showSchedule && (
                <div className="px-3 pb-3 pt-2 space-y-3">
                  <div>
                    <Label className="text-xs">New amount from that month (₹)</Label>
                    <Input
                      type="number"
                      value={pendingAmt}
                      onChange={(e) => setPendingAmt(e.target.value)}
                      placeholder="e.g. 25000"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-2 block">Effective from</Label>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {MONTHS.map((m, i) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPendingMonth(i + 1)}
                          className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium border transition-colors",
                            pendingMonth === i + 1
                              ? "bg-zinc-900 text-white border-zinc-900"
                              : "border-border text-muted-foreground hover:border-zinc-500"
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    <Input
                      type="number"
                      value={pendingYear}
                      onChange={(e) => setPendingYear(parseInt(e.target.value) || nextMonth.year)}
                      placeholder="Year"
                      className="w-24"
                    />
                  </div>
                  {pendingAmt && (
                    <p className="text-[10px] text-muted-foreground">
                      From {MONTHS[pendingMonth - 1]} {pendingYear}, this template will use{" "}
                      <span className="font-semibold text-foreground">{formatCurrency(parseFloat(pendingAmt) || 0)}</span>/month
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading || !isValid} className="w-full">
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
