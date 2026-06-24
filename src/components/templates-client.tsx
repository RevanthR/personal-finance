"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/utils";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Template = {
  id: string;
  name: string;
  category: string;
  amount: number;
  isFixed: boolean;
  dueDateDay: number | null;
  isActive: boolean;
  sortOrder: number;
};

export function TemplatesClient({ templates: initial }: { templates: Template[] }) {
  const [templates, setTemplates] = useState(initial);
  const [editing, setEditing] = useState<Template | null>(null);
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

  async function saveEdit(data: { name: string; category: string; amount: number; isFixed: boolean; dueDateDay?: number }) {
    if (!editing) return;
    const res = await fetch(`/api/templates/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { toast.error("Failed to save"); return; }
    setTemplates((prev) => prev.map((x) => x.id === editing.id ? { ...x, ...data } : x));
    toast.success("Template updated");
    setEditing(null);
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template? It won't affect past entries.")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    setTemplates((prev) => prev.filter((x) => x.id !== id));
    toast.success("Deleted");
  }

  async function addTemplate(data: { name: string; category: string; amount: number; isFixed: boolean; dueDateDay?: number }) {
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

  const byCategory = Object.entries(
    templates.reduce<Record<string, Template[]>>((acc, t) => {
      if (!acc[t.category]) acc[t.category] = [];
      acc[t.category].push(t);
      return acc;
    }, {})
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recurring Templates</h1>
          <p className="text-sm text-muted-foreground">
            {templates.filter((t) => t.isActive).length} active · auto-populate each month
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="bg-zinc-900 hover:bg-zinc-800">
          <Plus className="w-4 h-4 mr-1" /> Add Template
        </Button>
      </div>

      {byCategory.map(([cat, items]) => (
        <div key={cat}>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {CATEGORY_LABELS[cat] ?? cat}
          </h2>
          <div className="space-y-2">
            {items.map((t) => (
              <Card key={t.id} className={!t.isActive ? "opacity-50" : ""}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div
                    className="w-1 h-10 rounded-full shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[t.category] ?? "#6b7280" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      {!t.isFixed && <Badge variant="outline" className="text-xs">Variable</Badge>}
                      {t.dueDateDay && (
                        <Badge variant="secondary" className="text-xs">Due {t.dueDateDay}th</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{formatCurrency(t.amount)}/month</p>
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
            ))}
          </div>
        </div>
      ))}

      {/* Edit dialog */}
      {editing && (
        <TemplateDialog
          open
          title="Edit Template"
          initial={editing}
          onOpenChange={(v) => !v && setEditing(null)}
          onSave={saveEdit}
        />
      )}

      {/* Add dialog */}
      <TemplateDialog
        open={showAdd}
        title="Add Template"
        onOpenChange={setShowAdd}
        onSave={addTemplate}
      />
    </div>
  );
}

function TemplateDialog({
  open, title, initial, onOpenChange, onSave,
}: {
  open: boolean;
  title: string;
  initial?: Partial<Template>;
  onOpenChange: (v: boolean) => void;
  onSave: (data: { name: string; category: string; amount: number; isFixed: boolean; dueDateDay?: number }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [isFixed, setIsFixed] = useState(initial?.isFixed ?? true);
  const [dueDateDay, setDueDateDay] = useState(String(initial?.dueDateDay ?? ""));
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onSave({
      name, category,
      amount: parseFloat(amount),
      isFixed,
      dueDateDay: dueDateDay ? parseInt(dueDateDay) : undefined,
    });
    setLoading(false);
  }

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
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory} required>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Button type="submit" disabled={loading} className="w-full bg-zinc-900 hover:bg-zinc-800">
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
