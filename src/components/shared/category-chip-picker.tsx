"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { EXPENSE_CATEGORY_CHIPS, getCategoryColor, getCategoryIcon, getSubCategoryIcon } from "@/lib/utils";
import type { CategoryPicker } from "@/hooks/use-category-picker";

interface CategoryChipPickerProps {
  picker: CategoryPicker;
  customCategories: { id: string; name: string }[];
}

// Category + (once picked) Sub-category chip rows — single-tap selection,
// same interaction model as a Payment Method chip row. Shared by the
// manual Add Transaction dialog and the Gmail-sync review form, which
// previously each hand-rolled an near-identical copy of this markup.
export function CategoryChipPicker({ picker, customCategories }: CategoryChipPickerProps) {
  const {
    category, customCategoryName, subLabel, showNewCategory, showNewSubcat,
    setCustomCategoryName, setSubLabel, setShowNewCategory, setShowNewSubcat,
    selectBuiltInCategory, selectCustomCategory, selectSubCategory,
    hasCategory, subcatChips,
  } = picker;

  return (
    <>
      <div>
        <Label className="text-xs mb-1.5 block">Category</Label>
        <div className="flex flex-wrap gap-1.5">
          {EXPENSE_CATEGORY_CHIPS.map(c => (
            <Chip
              key={c.value}
              label={c.label}
              icon={getCategoryIcon(c.value)}
              color={getCategoryColor(c.value)}
              active={category === c.value}
              onClick={() => selectBuiltInCategory(c.value)}
            />
          ))}
          {customCategories.map(c => (
            <Chip
              key={c.id}
              label={c.name}
              icon={getCategoryIcon("MISCELLANEOUS", c.name)}
              color={getCategoryColor("MISCELLANEOUS", c.name)}
              active={customCategoryName === c.name}
              onClick={() => selectCustomCategory(c.name)}
            />
          ))}
          <Chip label="+ New" dashed active={showNewCategory} onClick={() => setShowNewCategory(v => !v)} />
        </div>
        {showNewCategory && (
          <Input
            className="mt-2"
            placeholder="Category name (e.g. Kids)"
            value={customCategoryName}
            onChange={e => setCustomCategoryName(e.target.value)}
            autoFocus
          />
        )}
      </div>

      {hasCategory && (
        <div>
          <Label className="text-xs mb-1.5 block">Sub-category</Label>
          <div className="flex flex-wrap gap-1.5">
            {subcatChips.map(name => (
              <Chip
                key={name}
                label={name}
                icon={getSubCategoryIcon(name)}
                color={getCategoryColor(category, customCategoryName || null)}
                active={subLabel === name}
                onClick={() => selectSubCategory(name)}
              />
            ))}
            <Chip label="+ New" dashed active={showNewSubcat} onClick={() => setShowNewSubcat(v => !v)} />
          </div>
          {showNewSubcat && (
            <Input
              className="mt-2"
              placeholder="Sub-category name (e.g. Coffee)"
              value={subLabel}
              onChange={e => setSubLabel(e.target.value)}
              autoFocus
            />
          )}
        </div>
      )}
    </>
  );
}
