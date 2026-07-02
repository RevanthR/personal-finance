"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  formatCurrency, CATEGORY_LABELS, INCOME_CATEGORIES, getCategoryDisplay, getCategoryColor, cn,
} from "@/lib/utils";
import { Plus, Pencil, Trash2, Lock, ChevronDown, TrendingUp, SlidersHorizontal } from "lucide-react";
import { computeLoanAmortization, computeChitCurrentMonth, computeChitEndDate } from "@/lib/loan-utils";
import { PageCoach } from "@/components/coach/page-coach";
import { format } from "date-fns";
import { toast } from "sonner";
import { ForecloseDialog } from "@/components/templates/foreclose-dialog";
import { usePrivacy } from "@/contexts/privacy-context";

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
  templateType: string;
  endsOnMonth: number | null;
  endsOnYear: number | null;
  sortOrder: number;
  loanOriginalPrincipal: number | null;
  loanInterestRate: number | null;
  loanRateType: string | null;
  loanStartDate: string | null;
  loanOutstandingOverride: number | null;
  chitFund: { id: string; startDate: string; durationMonths: number; totalValue: number; monthlyUnliftedAmount: number; monthlyLiftedAmount: number | null } | null;
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
  templateType?: string;
  addToCurrentMonth?: boolean;
  pendingAmount?: number | null;
  pendingFromMonth?: number | null;
  pendingFromYear?: number | null;
  clearPending?: boolean;
  endsOnMonth?: number | null;
  endsOnYear?: number | null;
  clearEndDate?: boolean;
  loanOriginalPrincipal?: number | null;
  loanInterestRate?: number | null;
  loanRateType?: string | null;
  loanStartDate?: string | null;
  loanOutstandingOverride?: number | null;
  chitFundPatch?: {
    startDate?: string;
    durationMonths?: number;
    totalValue?: number;
    monthlyUnliftedAmount?: number;
    monthlyLiftedAmount?: number | null;
  };
};

export function TemplatesClient({
  templates: initial,
  recentIncome,
}: {
  templates: Template[];
  recentIncome: { salary: number; freelance: number; other: number } | null;
}) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const [templates, setTemplates] = useState(initial);
  const [editing, setEditing] = useState<Template | null>(null);
  const [foreclosing, setForeclosing] = useState<Template | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

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
    const updated = await res.json();

    // For chit funds, also update the ChitFund record
    if (editing.category === "CHIT_FUND" && editing.chitFund?.id && data.chitFundPatch) {
      const chitRes = await fetch(`/api/chits/${editing.chitFund.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.chitFundPatch),
      });
      if (!chitRes.ok) { toast.error("Failed to update chit details"); return; }
      const updatedChit = await chitRes.json();
      setTemplates((prev) => prev.map((x) =>
        x.id === editing.id ? { ...x, ...updated, chitFund: updatedChit } : x
      ));
    } else {
      setTemplates((prev) => prev.map((x) => x.id === editing.id ? { ...x, ...updated } : x));
    }

    toast.success("Item updated");
    setEditing(null);
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template? It won't affect past entries.")) return;
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
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
    toast.success("Item added");
    setShowAdd(false);
  }

  async function handleImportIncome() {
    if (!recentIncome) return;
    setImportLoading(true);
    const toImport = [
      { name: "Salary", category: "SALARY", amount: recentIncome.salary },
      { name: "Freelance", category: "FREELANCE", amount: recentIncome.freelance },
      { name: "Other Income", category: "OTHER_INCOME", amount: recentIncome.other },
    ].filter(i => i.amount > 0);

    const created: Template[] = [];
    for (const item of toImport) {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...item, isFixed: true, frequency: "MONTHLY", templateType: "INCOME" }),
      });
      if (res.ok) {
        const t = await res.json();
        created.push({ ...t, templateType: "INCOME" });
      }
    }
    setTemplates(prev => [...prev, ...created]);
    setImportLoading(false);
    if (created.length > 0) toast.success(`Imported ${created.length} income template${created.length !== 1 ? "s" : ""}`);
  }

  const incomeTemplates = templates.filter(t => t.templateType === "INCOME");
  const expenseTemplates = templates.filter(t => t.templateType !== "INCOME");

  const groupedIncome = incomeTemplates.reduce<Record<string, Template[]>>((acc, t) => {
    const key = t.customCategory ?? t.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const grouped = expenseTemplates.reduce<Record<string, Template[]>>((acc, t) => {
    const key = t.customCategory ?? t.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  // Income summary stats
  const activeIncome = incomeTemplates.filter(t => t.isActive);
  const monthlyIncome = activeIncome.reduce((s, t) => s + (t.frequency === "MONTHLY" ? t.amount : 0), 0);
  const pendingIncomeChanges = activeIncome.filter(t => t.pendingAmount != null && t.pendingFromMonth != null && t.pendingFromYear != null);

  const [activeTab, setActiveTab] = useState<"income" | "expenses">("income");

  return (
    <div className="space-y-4">
      <PageCoach
        coachKey="templates"
        icon={SlidersHorizontal}
        iconClass="text-violet-600"
        bgClass="bg-violet-50 border-violet-100"
        title="Set up your recurring items here"
        desc="Add salary, EMIs, rent, and subscriptions once; they auto-fill your dashboard every month. Income items go under the Income tab."
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configuration</h1>
          <p className="text-sm text-muted-foreground">
            {templates.filter((t) => t.isActive).length} active recurring items
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "income" | "expenses")}>
        <TabsList className="w-full">
          <TabsTrigger value="income" className="flex-1">Income</TabsTrigger>
          <TabsTrigger value="expenses" className="flex-1">Expenses</TabsTrigger>
        </TabsList>

        {/* ── Income tab ── */}
        <TabsContent value="income" className="space-y-4">
          {/* Income summary bar */}
          {activeIncome.length > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs font-semibold text-green-800 uppercase tracking-wider">Recurring Income</span>
                </div>
                <span className="text-base font-bold text-green-700">{fmt(monthlyIncome)}<span className="text-xs font-normal text-green-600">/mo</span></span>
              </div>
              {pendingIncomeChanges.map(t => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <span className="text-green-700">{t.name}</span>
                  <span className="text-amber-700 font-medium">
                    ↑ {fmt(t.pendingAmount!)} from {MONTHS[(t.pendingFromMonth! - 1)]} {t.pendingFromYear}
                  </span>
                </div>
              ))}
            </div>
          )}

          {incomeTemplates.length === 0 && recentIncome && (recentIncome.salary + recentIncome.freelance + recentIncome.other) > 0 ? (
            <div className="rounded-xl border border-dashed border-green-200 bg-green-50/40 p-4">
              <p className="text-xs font-semibold text-green-800 mb-1">Import from your history</p>
              <p className="text-[11px] text-green-700/70 mb-3">
                We found recurring income from your recent months. Create templates so future months auto-fill.
              </p>
              <div className="space-y-1 mb-3">
                {recentIncome.salary > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-700">Salary</span>
                    <span className="font-medium text-green-800 tabular-nums">{fmt(recentIncome.salary)}/mo</span>
                  </div>
                )}
                {recentIncome.freelance > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-700">Freelance</span>
                    <span className="font-medium text-green-800 tabular-nums">{fmt(recentIncome.freelance)}/mo</span>
                  </div>
                )}
                {recentIncome.other > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-700">Other Income</span>
                    <span className="font-medium text-green-800 tabular-nums">{fmt(recentIncome.other)}/mo</span>
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleImportIncome}
                disabled={importLoading}
                className="border-green-300 text-green-700 hover:bg-green-100 hover:text-green-800"
              >
                {importLoading ? "Importing…" : "Import as templates"}
              </Button>
            </div>
          ) : incomeTemplates.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No income templates yet.
              <br />
              <button className="mt-2 text-xs underline" onClick={() => setShowAdd(true)}>Add one</button>
            </div>
          ) : null}

          {/* Income grouped by category */}
          {Object.entries(groupedIncome).map(([key, items]) => {
            const first = items[0];
            const displayLabel = getCategoryDisplay(first.category, first.customCategory);
            const color = getCategoryColor(first.category, first.customCategory);
            return (
              <div key={key}>
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{displayLabel}</h2>
                </div>
                <div className="space-y-2">
                  {items.map(t => {
                    const hasPending = t.pendingAmount != null && t.pendingFromMonth != null && t.pendingFromYear != null;
                    const pendingDir = hasPending && t.pendingAmount! > t.amount ? "↑" : "↓";
                    return (
                      <Card key={t.id} className={cn(!t.isActive ? "opacity-50" : "")}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium truncate">{t.name}</p>
                              {t.frequency === "YEARLY" && (
                                <Badge className="text-xs bg-violet-50 text-violet-700 hover:bg-violet-50 border border-violet-200">
                                  Yearly{t.dueMonth ? ` · ${MONTHS[t.dueMonth - 1]}` : ""}
                                </Badge>
                              )}
                              {hasPending && (
                                <Badge className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-50 border border-amber-200">
                                  {pendingDir} {fmt(t.pendingAmount!)} from {MONTHS[(t.pendingFromMonth! - 1)]} {t.pendingFromYear}
                                </Badge>
                              )}
                              {t.endsOnMonth != null && t.endsOnYear != null && (
                                <Badge className="text-xs bg-rose-50 text-rose-600 hover:bg-rose-50 border border-rose-200">
                                  Ends {MONTHS[t.endsOnMonth - 1]} {t.endsOnYear}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{fmt(t.amount)}/{t.frequency === "YEARLY" ? "year" : "month"}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Switch checked={t.isActive} onCheckedChange={() => toggleActive(t)} />
                            <button onClick={() => setEditing(t)} className="text-muted-foreground hover:text-foreground">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteTemplate(t.id)} className="text-muted-foreground hover:text-red-600">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* ── Expenses tab ── */}
        <TabsContent value="expenses" className="space-y-4">
          {expenseTemplates.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No expense templates yet.
              <br />
              <button className="mt-2 text-xs underline" onClick={() => setShowAdd(true)}>Add one</button>
            </div>
          )}

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
                                  Closed {format(new Date(t.foreClosedOn!), "MMM yyyy")}
                                </Badge>
                              )}
                              {hasPending && (
                                <Badge className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-50 border border-amber-200">
                                  {pendingDir} {fmt(t.pendingAmount!)} from {MONTHS[(t.pendingFromMonth! - 1)]} {t.pendingFromYear}
                                </Badge>
                              )}
                              {!isClosed && t.endsOnMonth != null && t.endsOnYear != null && (
                                <Badge className="text-xs bg-rose-50 text-rose-600 hover:bg-rose-50 border border-rose-200">
                                  Ends {MONTHS[t.endsOnMonth - 1]} {t.endsOnYear}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {isClosed && t.foreCloseAmount
                                ? `Settled ${fmt(t.foreCloseAmount)}`
                                : t.category === "LOAN"
                                  ? `EMI ${fmt(t.amount)}/month`
                                  : t.category === "CHIT_FUND"
                                    ? `${fmt(t.amount)}/month${t.chitFund ? ` · pot ${fmt(t.chitFund.totalValue)}` : ""}`
                                    : `${fmt(t.amount)}/${t.frequency === "YEARLY" ? "year" : "month"}`}
                              {!isClosed && t.category === "CREDIT_CARD" && (t.statementDay || t.dueDateDay) && (
                                <span className="ml-1.5 text-blue-500">
                                  {t.statementDay ? `closes ${t.statementDay}th` : ""}
                                  {t.dueDateDay ? ` · due ${t.dueDateDay}th` : ""}
                                </span>
                              )}
                              {!isClosed && t.category === "LOAN" && t.loanInterestRate && (
                                <span className="ml-1.5 text-muted-foreground/70">· {t.loanInterestRate}% {t.loanRateType === "FLOATING" ? "floating" : "fixed"}</span>
                              )}
                              {!isClosed && t.category === "LOAN" && t.loanInterestRate && (() => {
                                const amort = computeLoanAmortization({ emi: t.amount, annualRate: t.loanInterestRate!, originalPrincipal: t.loanOriginalPrincipal, startDate: t.loanStartDate, outstandingOverride: t.loanOutstandingOverride });
                                return amort && amort.monthsRemaining > 0 ? (
                                  <span className="ml-1.5 text-muted-foreground/70">· {amort.monthsRemaining} mo left</span>
                                ) : null;
                              })()}
                              {!isClosed && t.category === "CHIT_FUND" && t.chitFund?.startDate && t.chitFund?.durationMonths && (() => {
                                const cur = computeChitCurrentMonth(t.chitFund.startDate);
                                const dur = t.chitFund.durationMonths;
                                return cur <= dur ? (
                                  <span className="ml-1.5 text-muted-foreground/70">
                                    · month {cur} of {dur}
                                  </span>
                                ) : null;
                              })()}
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
                                    title="Mark as closed"
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
        </TabsContent>
      </Tabs>

      {editing && (
        <TemplateDialog
          open
          title="Edit Item"
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
        title="Add Item"
        defaultType={activeTab === "income" ? "INCOME" : "EXPENSE"}
        onOpenChange={setShowAdd}
        onSave={addTemplate}
      />
    </div>
  );
}

const EXPENSE_CATEGORY_CHIPS = Object.entries(CATEGORY_LABELS).filter(
  ([k]) => !["MISCELLANEOUS", "SALARY", "FREELANCE", "RENTAL", "BUSINESS", "INVESTMENTS", "OTHER_INCOME"].includes(k)
);
const INCOME_CATEGORY_CHIPS_LABELS = INCOME_CATEGORIES.map(k => [k, CATEGORY_LABELS[k]] as [string, string]);

function TemplateDialog({
  open, title, initial, defaultType = "EXPENSE", onOpenChange, onSave,
}: {
  open: boolean;
  title: string;
  initial?: Partial<Template>;
  defaultType?: "INCOME" | "EXPENSE";
  onOpenChange: (v: boolean) => void;
  onSave: (data: SaveData) => Promise<void>;
}) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
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
  const [templateType, setTemplateType] = useState<"INCOME" | "EXPENSE">(
    (initial?.templateType as "INCOME" | "EXPENSE") ?? defaultType
  );
  const [loading, setLoading] = useState(false);

  // Apply to current month (new templates only)
  const [addToCurrentMonth, setAddToCurrentMonth] = useState(true);

  // Part 2: scheduled future change — auto-expand for income edits
  const isEditingIncome = isEditing && (initial?.templateType === "INCOME");
  const [showSchedule, setShowSchedule] = useState(
    isEditing && (initial?.pendingAmount != null || isEditingIncome)
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

  // End date
  const hasExistingEndDate = initial?.endsOnMonth != null && initial?.endsOnYear != null;
  const [endsType, setEndsType] = useState<"indefinite" | "date">(hasExistingEndDate ? "date" : "indefinite");
  const defaultEndMonth = (() => { const d = new Date(); d.setMonth(d.getMonth() + 12); return d.getMonth() + 1; })();
  const defaultEndYear  = (() => { const d = new Date(); d.setMonth(d.getMonth() + 12); return d.getFullYear(); })();
  const [endsOnMonth, setEndsOnMonth] = useState<number>(initial?.endsOnMonth ?? defaultEndMonth);
  const [endsOnYear,  setEndsOnYear]  = useState<number>(initial?.endsOnYear  ?? defaultEndYear);

  // Loan fields
  const [loanPrincipal, setLoanPrincipal] = useState(initial?.loanOriginalPrincipal != null ? String(initial.loanOriginalPrincipal) : "");
  const [loanRate, setLoanRate] = useState(initial?.loanInterestRate != null ? String(initial.loanInterestRate) : "");
  const [loanRateType, setLoanRateType] = useState<"FIXED" | "FLOATING">((initial?.loanRateType as "FIXED" | "FLOATING") ?? "FIXED");
  const [loanStartDate, setLoanStartDate] = useState(initial?.loanStartDate ? initial.loanStartDate.slice(0, 10) : "");
  const [loanOutstanding, setLoanOutstanding] = useState(initial?.loanOutstandingOverride != null ? String(initial.loanOutstandingOverride) : "");

  // Chit fund fields
  const now2 = new Date();
  const existingChitStart = initial?.chitFund?.startDate ? new Date(initial.chitFund.startDate) : null;
  const [chitStartMonth, setChitStartMonth] = useState(existingChitStart ? existingChitStart.getUTCMonth() + 1 : now2.getMonth() + 1);
  const [chitStartYear, setChitStartYear] = useState(existingChitStart ? existingChitStart.getUTCFullYear() : now2.getFullYear());
  const [chitDuration, setChitDuration] = useState(initial?.chitFund?.durationMonths != null ? String(initial.chitFund.durationMonths) : "");
  const [chitTotalValue, setChitTotalValue] = useState(initial?.chitFund?.totalValue != null ? String(initial.chitFund.totalValue) : "");
  const [chitMonthlyLifted, setChitMonthlyLifted] = useState(initial?.chitFund?.monthlyLiftedAmount != null ? String(initial.chitFund.monthlyLiftedAmount) : "");

  function chitEndLabel() {
    const dur = parseInt(chitDuration);
    if (!dur || !chitStartMonth || !chitStartYear) return "";
    const totalMonths = (chitStartMonth - 1) + dur - 1;
    const endMonth = (totalMonths % 12) + 1;
    const endYear = chitStartYear + Math.floor(totalMonths / 12);
    return `${MONTHS[endMonth - 1]} ${endYear}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    setLoading(true);
    const isCustom = category === "__custom__";
    const pendingValid = showSchedule && pendingAmt && parseFloat(pendingAmt) > 0;
    const endDateValid = endsType === "date";
    const hadEndDate = initial?.endsOnMonth != null;

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
      templateType,
      ...(!isEditing && templateType !== "INCOME" && { addToCurrentMonth }),
      ...(pendingValid && {
        pendingAmount: parseFloat(pendingAmt),
        pendingFromMonth: pendingMonth,
        pendingFromYear: pendingYear,
      }),
      ...(!showSchedule && isEditing && initial?.pendingAmount != null && { clearPending: true }),
      ...(endDateValid && { endsOnMonth, endsOnYear }),
      ...(endsType === "indefinite" && hadEndDate && { clearEndDate: true }),
      // Loan amortization fields (only for LOAN category)
      ...(category === "LOAN" && {
        loanOriginalPrincipal: loanPrincipal ? parseFloat(loanPrincipal) : null,
        loanInterestRate: loanRate ? parseFloat(loanRate) : null,
        loanRateType,
        loanStartDate: loanStartDate || null,
        loanOutstandingOverride: loanOutstanding ? parseFloat(loanOutstanding) : null,
      }),
      // Chit fund fields (only for CHIT_FUND category, edit only)
      ...(category === "CHIT_FUND" && isEditing && {
        chitFundPatch: {
          startDate: `${chitStartYear}-${String(chitStartMonth).padStart(2, "0")}-01`,
          durationMonths: parseInt(chitDuration) || undefined,
          totalValue: chitTotalValue ? parseFloat(chitTotalValue) : undefined,
          monthlyUnliftedAmount: parseFloat(amount),
          monthlyLiftedAmount: chitMonthlyLifted ? parseFloat(chitMonthlyLifted) : null,
        },
      }),
    });
    setLoading(false);
  }

  const isCustom = category === "__custom__";
  const isIncome = templateType === "INCOME";
  const isLoan = category === "LOAN";
  const isCC = category === "CREDIT_CARD";
  const isChit = category === "CHIT_FUND";
  const isValid = name && category && (!isCustom || customLabel) && amount && (frequency === "MONTHLY" || dueMonth !== null);

  function amountLabel() {
    if (isIncome) return "Monthly amount (₹)";
    if (isLoan) return "EMI amount (₹)";
    if (isCC) return isEditing ? "Bill amount (₹)" : "Expected monthly bill (₹)";
    if (isChit) return "Monthly contribution (₹)";
    return "Monthly amount (₹)";
  }

  const scheduleLabel = isLoan
    ? (showSchedule ? "EMI update planned" : "Update EMI amount")
    : (showSchedule ? "Planned amount change" : "Plan an upcoming change");

  const MonthChips = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div className="flex flex-wrap gap-1">
      {MONTHS.map((m, i) => (
        <button key={m} type="button" onClick={() => onChange(i + 1)}
          className={cn("px-2 py-0.5 rounded text-xs font-medium border transition-colors",
            value === i + 1 ? "bg-zinc-900 text-white border-zinc-900" : "border-border text-muted-foreground hover:border-zinc-500"
          )}>
          {m}
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Income vs Expense toggle — new templates only */}
          {!isEditing && (
            <div className="flex gap-2">
              {(["EXPENSE", "INCOME"] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => { setTemplateType(t); setCategory(""); setCustomLabel(""); }}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    templateType === t
                      ? t === "INCOME" ? "bg-green-600 text-white border-green-600" : "bg-zinc-900 text-white border-zinc-900"
                      : "border-border text-muted-foreground hover:border-zinc-500"
                  )}>
                  {t === "INCOME" ? "Income" : "Expense"}
                </button>
              ))}
            </div>
          )}

          {/* ── Basics ── */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
            </div>

            <div>
              <Label className="text-xs mb-2 block">Category</Label>
              <div className="flex flex-wrap gap-1.5">
                {(isIncome ? INCOME_CATEGORY_CHIPS_LABELS : EXPENSE_CATEGORY_CHIPS).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => { setCategory(k); setCustomLabel(""); }}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      category === k ? "bg-zinc-900 text-white border-zinc-900" : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground"
                    )}>
                    {v}
                  </button>
                ))}
                {!isIncome && (
                  <button type="button" onClick={() => setCategory("__custom__")}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      isCustom ? "bg-zinc-900 text-white border-zinc-900" : "border-dashed border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground"
                    )}>
                    + Custom
                  </button>
                )}
              </div>
              {isCustom && !isIncome && (
                <Input className="mt-2" placeholder="Category name (e.g. Insurance)"
                  value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} autoFocus required={isCustom} />
              )}
            </div>

            <div>
              <Label className="text-xs">{amountLabel()}</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required className="mt-1" />
            </div>

            {!isEditing && !isIncome && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/30">
                <Label className="text-xs cursor-pointer">Show in current month</Label>
                <Switch checked={addToCurrentMonth} onCheckedChange={setAddToCurrentMonth} />
              </div>
            )}
          </div>

          {/* ── Loan amortization details (right after amount, before payment settings) ── */}
          {isLoan && (
            <div className="space-y-3 rounded-xl border border-red-100 bg-red-50/50 p-3">
              <div>
                <p className="text-xs font-semibold text-red-700">Amortization details</p>
                <p className="text-[10px] text-red-600/70 mt-0.5">Optional. Enables principal vs interest breakdown on the dashboard.</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Original loan amount (₹)</label>
                  <Input type="number" value={loanPrincipal} onChange={e => setLoanPrincipal(e.target.value)}
                    placeholder="e.g. 20,00,000" className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Interest rate (% p.a.)</label>
                  <Input type="number" step="0.01" value={loanRate} onChange={e => setLoanRate(e.target.value)}
                    placeholder="e.g. 8.5" className="mt-1 h-8 text-sm" />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Rate type</label>
                <div className="flex gap-2 mt-1">
                  {(["FIXED", "FLOATING"] as const).map(t => (
                    <button key={t} type="button" onClick={() => setLoanRateType(t)}
                      className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                        loanRateType === t ? "bg-red-600 text-white border-red-600" : "bg-white border-border text-muted-foreground"
                      )}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
                {loanRateType === "FLOATING" && (
                  <p className="text-[10px] text-muted-foreground mt-1">Update the rate and outstanding balance whenever your bank revises it.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Loan start date</label>
                  <Input type="date" value={loanStartDate} onChange={e => setLoanStartDate(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Current balance (₹){loanRateType === "FLOATING" && <span className="text-red-600">*</span>}
                  </label>
                  <Input type="number" value={loanOutstanding} onChange={e => setLoanOutstanding(e.target.value)}
                    placeholder="From bank" className="mt-1 h-8 text-sm" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Leave current balance blank to auto-compute from start date.</p>
            </div>
          )}

          {/* ── Chit fund details (edit only) ── */}
          {isChit && isEditing && (
            <div className="space-y-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
              <div>
                <p className="text-xs font-semibold text-amber-700">Chit details</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Start month</label>
                  {chitEndLabel() && <span className="text-[11px] text-muted-foreground">ends {chitEndLabel()}</span>}
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {MONTHS.map((m, i) => (
                    <button key={m} type="button" onClick={() => setChitStartMonth(i + 1)}
                      className={cn("px-2 py-0.5 rounded text-xs font-medium border transition-colors",
                        chitStartMonth === i + 1 ? "bg-zinc-900 text-white border-zinc-900" : "border-border text-muted-foreground"
                      )}>
                      {m}
                    </button>
                  ))}
                </div>
                <Input type="number" value={chitStartYear}
                  onChange={e => setChitStartYear(parseInt(e.target.value) || new Date().getFullYear())}
                  placeholder="Year" min={2020} max={2040} className="h-8 text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Duration (months)</label>
                  <Input type="number" value={chitDuration} onChange={e => setChitDuration(e.target.value)}
                    placeholder="e.g. 20" className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Pot value (₹)</label>
                  <Input type="number" value={chitTotalValue} onChange={e => setChitTotalValue(e.target.value)}
                    placeholder="e.g. 300000" className="mt-1 h-8 text-sm" />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Monthly contribution after lifting (₹)</label>
                <p className="text-[10px] text-muted-foreground mb-1">Leave blank if same as before lifting</p>
                <Input type="number" value={chitMonthlyLifted} onChange={e => setChitMonthlyLifted(e.target.value)}
                  placeholder="Optional" className="h-8 text-sm" />
              </div>
            </div>
          )}

          {/* ── Payment settings ── */}
          <div className="space-y-3 rounded-xl border bg-muted/20 px-3 py-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Payment settings</p>

            {!isIncome && (
              <div className="flex items-center justify-between">
                <Label className="text-xs">Same amount every month</Label>
                <Switch checked={isFixed} onCheckedChange={setIsFixed} />
              </div>
            )}

            <div>
              <Label className="text-xs mb-2 block">Frequency</Label>
              <div className="flex gap-2">
                {(["MONTHLY", "YEARLY"] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setFrequency(f)}
                    className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                      frequency === f ? "bg-zinc-900 text-white border-zinc-900" : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground"
                    )}>
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
                    <button key={m} type="button" onClick={() => setDueMonth(i + 1)}
                      className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                        dueMonth === i + 1 ? "bg-zinc-900 text-white border-zinc-900" : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground"
                      )}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isIncome && (
              <div>
                <Label className="text-xs">Due date (day of month, optional)</Label>
                <Input type="number" min="1" max="31" value={dueDateDay}
                  onChange={(e) => setDueDateDay(e.target.value)} placeholder="e.g. 21" className="mt-1" />
              </div>
            )}

            {isCC && (
              <div>
                <Label className="text-xs">Billing cut-off day (optional)</Label>
                <Input type="number" min="1" max="31" value={statementDay}
                  onChange={(e) => setStatementDay(e.target.value)} placeholder="e.g. 15" className="mt-1" />
                {statementDay && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Charges on/before {statementDay}th go into this month&apos;s bill; charges after go into next month&apos;s.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Advanced: upcoming change + end date ── */}
          {isEditing && (
            <div className="border rounded-lg overflow-hidden">
              <button type="button" onClick={() => setShowSchedule(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium bg-muted/30 hover:bg-muted/50 transition-colors">
                <span>{scheduleLabel}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", showSchedule && "rotate-180")} />
              </button>

              {showSchedule && (
                <div className="px-3 pb-3 pt-2 space-y-3">
                  <div>
                    <Label className="text-xs">{isLoan ? "New EMI from that month (₹)" : "New amount from that month (₹)"}</Label>
                    <Input type="number" value={pendingAmt} onChange={(e) => setPendingAmt(e.target.value)}
                      placeholder="e.g. 25000" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs mb-2 block">Effective from</Label>
                    <MonthChips value={pendingMonth} onChange={setPendingMonth} />
                    <Input type="number" value={pendingYear}
                      onChange={(e) => setPendingYear(parseInt(e.target.value) || nextMonth.year)}
                      placeholder="Year" className="w-24 mt-2" />
                  </div>
                  {pendingAmt && (
                    <p className="text-[10px] text-muted-foreground">
                      From {MONTHS[pendingMonth - 1]} {pendingYear},{" "}
                      {isLoan ? "EMI becomes" : "amount changes to"}{" "}
                      <span className="font-semibold text-foreground">{fmt(parseFloat(pendingAmt) || 0)}</span>/month
                    </p>
                  )}

                  {/* End date (not applicable for loans — use Mark as closed instead) */}
                  {!isLoan && (
                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium">Stop after</span>
                        <div className="flex gap-1">
                          {(["indefinite", "date"] as const).map(v => (
                            <button key={v} type="button" onClick={() => setEndsType(v)}
                              className={cn("px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                                endsType === v ? "bg-zinc-900 text-white border-zinc-900" : "border-border text-muted-foreground hover:border-zinc-500"
                              )}>
                              {v === "indefinite" ? "Never" : "Set month"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {endsType === "date" && (
                        <div className="space-y-2">
                          <MonthChips value={endsOnMonth} onChange={setEndsOnMonth} />
                          <Input type="number" value={endsOnYear}
                            onChange={e => setEndsOnYear(parseInt(e.target.value) || defaultEndYear)}
                            placeholder="Year" className="w-24" />
                          <p className="text-[10px] text-muted-foreground">
                            Stops appearing in projections after {MONTHS[endsOnMonth - 1]} {endsOnYear}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* End date for new templates (non-loan, non-income) */}
          {!isEditing && !isIncome && !isLoan && (
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30">
                <span className="text-xs font-medium">Stop after</span>
                <div className="flex gap-1">
                  {(["indefinite", "date"] as const).map(v => (
                    <button key={v} type="button" onClick={() => setEndsType(v)}
                      className={cn("px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                        endsType === v ? "bg-zinc-900 text-white border-zinc-900" : "border-border text-muted-foreground hover:border-zinc-500"
                      )}>
                      {v === "indefinite" ? "Never" : "Set month"}
                    </button>
                  ))}
                </div>
              </div>
              {endsType === "date" && (
                <div className="px-3 pb-3 pt-2 space-y-2">
                  <MonthChips value={endsOnMonth} onChange={setEndsOnMonth} />
                  <Input type="number" value={endsOnYear}
                    onChange={e => setEndsOnYear(parseInt(e.target.value) || defaultEndYear)}
                    placeholder="Year" className="w-24" />
                  <p className="text-[10px] text-muted-foreground">
                    Stops appearing in projections after {MONTHS[endsOnMonth - 1]} {endsOnYear}
                  </p>
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
