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
import { Plus, Pencil, Trash2, Lock, ChevronDown, TrendingUp } from "lucide-react";
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
  templateType: string;
  endsOnMonth: number | null;
  endsOnYear: number | null;
  sortOrder: number;
  chitFund: { startDate: string; durationMonths: number } | null;
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
  updateCurrentMonth?: boolean;
  pendingAmount?: number | null;
  pendingFromMonth?: number | null;
  pendingFromYear?: number | null;
  clearPending?: boolean;
  endsOnMonth?: number | null;
  endsOnYear?: number | null;
  clearEndDate?: boolean;
};

export function TemplatesClient({
  templates: initial,
  recentIncome,
}: {
  templates: Template[];
  recentIncome: { salary: number; freelance: number; other: number } | null;
}) {
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
    const resolved: Template = {
      ...editing,
      ...data,
      customCategory: data.customCategory ?? null,
      category: data.customCategory ? "MISCELLANEOUS" : data.category,
      pendingAmount: data.clearPending ? null : (data.pendingAmount ?? editing.pendingAmount),
      pendingFromMonth: data.clearPending ? null : (data.pendingFromMonth ?? editing.pendingFromMonth),
      pendingFromYear: data.clearPending ? null : (data.pendingFromYear ?? editing.pendingFromYear),
      endsOnMonth: data.clearEndDate ? null : (data.endsOnMonth ?? editing.endsOnMonth),
      endsOnYear: data.clearEndDate ? null : (data.endsOnYear ?? editing.endsOnYear),
      statementDay: data.statementDay ?? editing.statementDay,
      frequency: data.frequency ?? editing.frequency,
      dueMonth: data.dueMonth !== undefined ? data.dueMonth : editing.dueMonth,
      templateType: data.templateType ?? editing.templateType,
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recurring Templates</h1>
          <p className="text-sm text-muted-foreground">
            {templates.filter((t) => t.isActive).length} active · auto-populate each month
          </p>
        </div>
        <Button onClick={() => { setShowAdd(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Add Template
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
                <span className="text-base font-bold text-green-700">{formatCurrency(monthlyIncome)}<span className="text-xs font-normal text-green-600">/mo</span></span>
              </div>
              {pendingIncomeChanges.map(t => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <span className="text-green-700">{t.name}</span>
                  <span className="text-amber-700 font-medium">
                    ↑ {formatCurrency(t.pendingAmount!)} from {MONTHS[(t.pendingFromMonth! - 1)]} {t.pendingFromYear}
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
                    <span className="font-medium text-green-800 tabular-nums">{formatCurrency(recentIncome.salary)}/mo</span>
                  </div>
                )}
                {recentIncome.freelance > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-700">Freelance</span>
                    <span className="font-medium text-green-800 tabular-nums">{formatCurrency(recentIncome.freelance)}/mo</span>
                  </div>
                )}
                {recentIncome.other > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-700">Other Income</span>
                    <span className="font-medium text-green-800 tabular-nums">{formatCurrency(recentIncome.other)}/mo</span>
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
                                  {pendingDir} {formatCurrency(t.pendingAmount!)} from {MONTHS[(t.pendingFromMonth! - 1)]} {t.pendingFromYear}
                                </Badge>
                              )}
                              {t.endsOnMonth != null && t.endsOnYear != null && (
                                <Badge className="text-xs bg-rose-50 text-rose-600 hover:bg-rose-50 border border-rose-200">
                                  Ends {MONTHS[t.endsOnMonth - 1]} {t.endsOnYear}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{formatCurrency(t.amount)}/{t.frequency === "YEARLY" ? "year" : "month"}</p>
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
                                  Closed · {format(new Date(t.foreClosedOn!), "MMM yyyy")}
                                </Badge>
                              )}
                              {hasPending && (
                                <Badge className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-50 border border-amber-200">
                                  {pendingDir} {formatCurrency(t.pendingAmount!)} from {MONTHS[(t.pendingFromMonth! - 1)]} {t.pendingFromYear}
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
        </TabsContent>
      </Tabs>

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

  // Part 1: apply to current month
  const [updateCurrentMonth, setUpdateCurrentMonth] = useState(false);

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
      ...(isEditing && { updateCurrentMonth }),
      ...(pendingValid && {
        pendingAmount: parseFloat(pendingAmt),
        pendingFromMonth: pendingMonth,
        pendingFromYear: pendingYear,
      }),
      ...(!showSchedule && isEditing && initial?.pendingAmount != null && { clearPending: true }),
      ...(endDateValid && { endsOnMonth, endsOnYear }),
      ...(endsType === "indefinite" && hadEndDate && { clearEndDate: true }),
    });
    setLoading(false);
  }

  const isCustom = category === "__custom__";
  const isIncome = templateType === "INCOME";
  const isValid = name && category && (!isCustom || customLabel) && amount && (frequency === "MONTHLY" || dueMonth !== null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Income vs Expense toggle — only on new templates */}
          {!isEditing && (
            <div className="flex gap-2">
              {(["EXPENSE", "INCOME"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTemplateType(t); setCategory(""); setCustomLabel(""); }}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    templateType === t
                      ? t === "INCOME"
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-zinc-900 text-white border-zinc-900"
                      : "border-border text-muted-foreground hover:border-zinc-500"
                  )}
                >
                  {t === "INCOME" ? "Income" : "Expense"}
                </button>
              ))}
            </div>
          )}

          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div>
            <Label className="text-xs mb-2 block">Category</Label>
            <div className="flex flex-wrap gap-1.5">
              {(isIncome ? INCOME_CATEGORY_CHIPS_LABELS : EXPENSE_CATEGORY_CHIPS).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setCategory(k); setCustomLabel(""); }}
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
              {!isIncome && (
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
              )}
            </div>
            {isCustom && !isIncome && (
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

          {!isIncome && (
            <div className="flex items-center justify-between">
              <Label className="text-xs">Fixed Amount</Label>
              <Switch checked={isFixed} onCheckedChange={setIsFixed} />
            </div>
          )}

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

          {!isIncome && (
            <div>
              <Label className="text-xs">Due Date (day of month, optional)</Label>
              <Input type="number" min="1" max="31" value={dueDateDay} onChange={(e) => setDueDateDay(e.target.value)} placeholder="e.g. 21" />
            </div>
          )}

          {!isIncome && category === "CREDIT_CARD" && (
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

          {!isIncome && (
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30">
                <span className="text-xs font-medium">End date</span>
                <div className="flex gap-1">
                  {(["indefinite", "date"] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setEndsType(v)}
                      className={cn(
                        "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                        endsType === v
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "border-border text-muted-foreground hover:border-zinc-500"
                      )}
                    >
                      {v === "indefinite" ? "Indefinite" : "Set month"}
                    </button>
                  ))}
                </div>
              </div>
              {endsType === "date" && (
                <div className="px-3 pb-3 pt-2 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {MONTHS.map((m, i) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setEndsOnMonth(i + 1)}
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium border transition-colors",
                          endsOnMonth === i + 1
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
                    value={endsOnYear}
                    onChange={e => setEndsOnYear(parseInt(e.target.value) || defaultEndYear)}
                    placeholder="Year"
                    className="w-24"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Template will not appear in projections after {MONTHS[endsOnMonth - 1]} {endsOnYear}
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
