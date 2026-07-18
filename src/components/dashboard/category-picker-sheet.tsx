"use client";

import { useMemo, useState } from "react";
import { BottomSheet, BottomSheetContent } from "@/components/ui/bottom-sheet";
import { CategoryBadge } from "@/components/ui/category-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, EXPENSE_CATEGORY_CHIPS, getCategoryDisplay, getCategoryColor, getCategoryIcon, getSubCategoryIcon } from "@/lib/utils";
import { Search, ChevronRight, ChevronLeft, Plus, X } from "lucide-react";

export type SubCategorySuggestion = { category: string | null; customCategoryId: string | null; subCategory: string | null };

type CatOption = { category?: string; customCategory?: string; label: string };

interface CategoryPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customCategories: { id: string; name: string }[];
  subCategorySuggestions: SubCategorySuggestion[];
  onSelect: (result: { category?: string; customCategory?: string; subCategory?: string }) => void;
}

const RECENT_LIMIT = 6;

function sameParent(a: CatOption, s: SubCategorySuggestion, customCategories: { id: string; name: string }[]) {
  return a.customCategory
    ? customCategories.find(c => c.id === s.customCategoryId)?.name === a.customCategory
    : a.category === s.category && !s.customCategoryId;
}

// Replaces the two sequential native <select> dropdowns with one browsable,
// searchable sheet: a "Recent" shortcut for one-tap repeat entries (built
// from real usage, most-recent-first per the orderBy on the query that
// feeds subCategorySuggestions), then every category drills into its own
// sub-categories, with "+ Add new" at both levels.
export function CategoryPickerSheet({ open, onOpenChange, customCategories, subCategorySuggestions, onSelect }: CategoryPickerSheetProps) {
  const [search, setSearch] = useState("");
  const [drill, setDrill] = useState<CatOption | null>(null);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewSubcat, setShowNewSubcat] = useState(false);
  const [newSubcatName, setNewSubcatName] = useState("");

  function reset() {
    setSearch(""); setDrill(null);
    setShowNewCategory(false); setNewCategoryName("");
    setShowNewSubcat(false); setNewSubcatName("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function finalize(result: { category?: string; customCategory?: string; subCategory?: string }) {
    onSelect(result);
    reset();
    onOpenChange(false);
  }

  const allCategories = useMemo<CatOption[]>(() => [
    ...EXPENSE_CATEGORY_CHIPS.map(c => ({ category: c.value as string, label: c.label })),
    ...customCategories.map(c => ({ customCategory: c.name, label: c.name })),
  ], [customCategories]);

  const recent = useMemo(() =>
    subCategorySuggestions.slice(0, RECENT_LIMIT).map(s => {
      const parent = allCategories.find(c => sameParent(c, s, customCategories));
      return parent ? { ...parent, subCategory: s.subCategory! } : null;
    }).filter((s): s is CatOption & { subCategory: string } => !!s),
    [subCategorySuggestions, allCategories, customCategories]
  );

  const subcatsForDrill = useMemo(() => {
    if (!drill) return [] as string[];
    return [...new Set(
      subCategorySuggestions
        .filter(s => sameParent(drill, s, customCategories))
        .map(s => s.subCategory)
        .filter((s): s is string => !!s)
    )];
  }, [drill, subCategorySuggestions, customCategories]);

  const q = search.trim().toLowerCase();
  const matchingCategories = q ? allCategories.filter(c => c.label.toLowerCase().includes(q)) : allCategories;
  const matchingCombos = q
    ? subCategorySuggestions
        .filter(s => s.subCategory?.toLowerCase().includes(q))
        .map(s => {
          const parent = allCategories.find(c => sameParent(c, s, customCategories));
          return parent ? { ...parent, subCategory: s.subCategory! } : null;
        })
        .filter((s): s is CatOption & { subCategory: string } => !!s)
    : [];

  function CategoryRow({ opt, onClick }: { opt: CatOption; onClick: () => void }) {
    const color = getCategoryColor(opt.category ?? "MISCELLANEOUS", opt.customCategory);
    const Icon = getCategoryIcon(opt.category ?? "MISCELLANEOUS", opt.customCategory);
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        <CategoryBadge icon={Icon} color={color} />
        <span className="flex-1 min-w-0 text-sm font-medium truncate">{opt.label}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0" />
      </button>
    );
  }

  function ComboRow({ opt, subCategory }: { opt: CatOption; subCategory: string }) {
    const color = getCategoryColor(opt.category ?? "MISCELLANEOUS", opt.customCategory);
    const Icon = getSubCategoryIcon(subCategory);
    return (
      <button
        type="button"
        onClick={() => finalize({ category: opt.category, customCategory: opt.customCategory, subCategory })}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        <CategoryBadge icon={Icon} color={color} />
        <span className="flex-1 min-w-0 text-sm">
          <span className="font-medium">{subCategory}</span>
          <span className="text-muted-foreground"> · {opt.label}</span>
        </span>
      </button>
    );
  }

  return (
    <BottomSheet open={open} onOpenChange={handleOpenChange}>
      <BottomSheetContent aria-describedby={undefined}>
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-border">
          {drill ? (
            <button type="button" onClick={() => setDrill(null)} className="shrink-0 flex items-center justify-center w-9 h-9 -ml-2 rounded-full hover:bg-muted">
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : (
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          {drill ? (
            <span className="flex-1 text-sm font-semibold truncate">{drill.label}</span>
          ) : (
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search category or sub-category..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          )}
          <button type="button" onClick={() => handleOpenChange(false)} className="shrink-0 flex items-center justify-center w-9 h-9 -mr-2 rounded-full hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 pb-[env(safe-area-inset-bottom)]">
          {drill ? (
            <>
              <button
                type="button"
                onClick={() => finalize({ category: drill.category, customCategory: drill.customCategory })}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b border-border"
              >
                <span className="flex-1 min-w-0 text-sm font-medium text-muted-foreground">No sub-category</span>
              </button>
              {subcatsForDrill.map(name => {
                const Icon = getSubCategoryIcon(name);
                const color = getCategoryColor(drill.category ?? "MISCELLANEOUS", drill.customCategory);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => finalize({ category: drill.category, customCategory: drill.customCategory, subCategory: name })}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <CategoryBadge icon={Icon} color={color} size="sm" />
                    <span className="flex-1 min-w-0 text-sm font-medium truncate">{name}</span>
                  </button>
                );
              })}
              {showNewSubcat ? (
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <Input
                    value={newSubcatName}
                    onChange={e => setNewSubcatName(e.target.value)}
                    placeholder="New sub-category name"
                    autoFocus
                    className="h-9"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newSubcatName.trim()}
                    onClick={() => finalize({ category: drill.category, customCategory: drill.customCategory, subCategory: newSubcatName.trim() })}
                  >
                    Add
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewSubcat(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left text-primary"
                >
                  <span className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-accent"><Plus className="w-4 h-4" /></span>
                  <span className="text-sm font-medium">Add new sub-category</span>
                </button>
              )}
            </>
          ) : q ? (
            <>
              {matchingCombos.length === 0 && matchingCategories.length === 0 && (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">No matches for &quot;{search}&quot;</p>
              )}
              {matchingCombos.map((c, i) => <ComboRow key={`${c.label}-${c.subCategory}-${i}`} opt={c} subCategory={c.subCategory} />)}
              {matchingCategories.map(c => (
                <CategoryRow key={c.category ?? c.customCategory} opt={c} onClick={() => setDrill(c)} />
              ))}
            </>
          ) : (
            <>
              {recent.length > 0 && (
                <>
                  <p className="fin-label px-4 pt-3 pb-1">Recent</p>
                  {recent.map((c, i) => <ComboRow key={`${c.label}-${c.subCategory}-${i}`} opt={c} subCategory={c.subCategory} />)}
                </>
              )}
              <p className="fin-label px-4 pt-3 pb-1">All Categories</p>
              {allCategories.map(c => (
                <CategoryRow key={c.category ?? c.customCategory} opt={c} onClick={() => setDrill(c)} />
              ))}
            </>
          )}

          {!drill && (
            showNewCategory ? (
              <div className="flex items-center gap-2 px-4 py-2.5">
                <Input
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="New category name (e.g. Kids)"
                  autoFocus
                  className="h-9"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!newCategoryName.trim()}
                  onClick={() => finalize({ customCategory: newCategoryName.trim() })}
                >
                  Add
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewCategory(true)}
                className={cn("w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left text-primary", (recent.length > 0 || allCategories.length > 0) && "border-t border-border")}
              >
                <span className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-accent"><Plus className="w-4 h-4" /></span>
                <span className="text-sm font-medium">Add new category</span>
              </button>
            )
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

// Small helper for the trigger button that opens the sheet — shows the
// current selection the same way the sheet itself would describe it.
export function categoryPickerLabel(category: string, customCategory: string | null, subCategory: string | null): string {
  if (!category && !customCategory) return "Select category...";
  const label = getCategoryDisplay(category, customCategory);
  return subCategory ? `${label} · ${subCategory}` : label;
}
