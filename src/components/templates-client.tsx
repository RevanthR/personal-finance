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
  formatCurrency, CATEGORY_LABELS, CATEGORY_COLORS, getCategoryDisplay, getCategoryColor, cn,
} from "@/lib/utils";
import { Plus, Pencil, Trash2, Lock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ForecloseDialog } from "@/components/templates/foreclose-dialog";

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
  sortOrder: number;
};

type SaveData = {
  name: string;
  category: string;
  customCategory?: string;
  amount: number;
  isFixed: boolean;
  dueDateDay?: number;
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

  // Group by display category key (customCategory takes precedence)
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
                return (
                  <Card key={t.id} className={cn(!t.isActive && !isClosed ? "opacity-50" : "")}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: isClosed ? "#d1d5db" : color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          {!t.isFixed && !isClosed && <Badge variant="outline" className="text-xs">Variable</Badge>}
                          {t.dueDateDay && !isClosed && (
                            <Badge variant="secondary" className="text-xs">Due {t.dueDateDay}th</Badge>
                          )}
                          {isClosed && (
                            <Badge className="text-xs bg-zinc-100 text-zinc-500 hover:bg-zinc-100 border-0">
                              Closed · {format(new Date(t.foreClosedOn!), "MMM yyyy")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {isClosed && t.foreCloseAmount
                            ? `Settled ${formatCurrency(t.foreCloseAmount)}`
                            : `${formatCurrency(t.amount)}/month`}
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
  const isExistingCustom = !!initial?.customCategory;
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(isExistingCustom ? "__custom__" : (initial?.category ?? ""));
  const [customLabel, setCustomLabel] = useState(initial?.customCategory ?? "");
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [isFixed, setIsFixed] = useState(initial?.isFixed ?? true);
  const [dueDateDay, setDueDateDay] = useState(String(initial?.dueDateDay ?? ""));
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    setLoading(true);
    const isCustom = category === "__custom__";
    await onSave({
      name,
      category: isCustom ? "MISCELLANEOUS" : category,
      customCategory: isCustom && customLabel ? customLabel : undefined,
      amount: parseFloat(amount),
      isFixed,
      dueDateDay: dueDateDay ? parseInt(dueDateDay) : undefined,
    });
    setLoading(false);
  }

  const isCustom = category === "__custom__";
  const isValid = name && category && (!isCustom || customLabel) && amount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
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
            <Label className="text-xs">Default Amount (₹)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Fixed Amount</Label>
            <Switch checked={isFixed} onCheckedChange={setIsFixed} />
          </div>
          <div>
            <Label className="text-xs">Due Date (day of month, optional)</Label>
            <Input type="number" min="1" max="31" value={dueDateDay} onChange={(e) => setDueDateDay(e.target.value)} placeholder="e.g. 21" />
          </div>
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
