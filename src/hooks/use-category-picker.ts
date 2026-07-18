import { useState } from "react";

export interface CategoryPickerSubcatSuggestion {
  category: string | null;
  customCategoryId: string | null;
  subCategory: string | null;
}

interface UseCategoryPickerOptions {
  initialCategory?: string;
  initialCustomCategory?: string;
  initialSubCategory?: string;
  customCategories: { id: string; name: string }[];
  subCategorySuggestions: CategoryPickerSubcatSuggestion[];
}

// Shared category/sub-category chip-selection state + derived values —
// previously duplicated near-identically between the manual Add Transaction
// dialog and the Gmail-sync review form's AddForm.
export function useCategoryPicker({
  initialCategory = "",
  initialCustomCategory = "",
  initialSubCategory = "",
  customCategories,
  subCategorySuggestions,
}: UseCategoryPickerOptions) {
  const [category, setCategory] = useState(initialCategory);
  const [customCategoryName, setCustomCategoryName] = useState(initialCustomCategory);
  const [subLabel, setSubLabel] = useState(initialSubCategory);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewSubcat, setShowNewSubcat] = useState(false);

  function selectBuiltInCategory(value: string) {
    setCategory(value); setCustomCategoryName(""); setShowNewCategory(false);
    setSubLabel(""); setShowNewSubcat(false);
  }
  function selectCustomCategory(name: string) {
    setCustomCategoryName(name); setCategory(""); setShowNewCategory(false);
    setSubLabel(""); setShowNewSubcat(false);
  }
  function selectSubCategory(value: string) {
    setSubLabel(value); setShowNewSubcat(false);
  }
  function reset() {
    setCategory(""); setCustomCategoryName(""); setShowNewCategory(false);
    setSubLabel(""); setShowNewSubcat(false);
  }

  const hasCategory = !!category || !!customCategoryName.trim();

  // Sub-category chips scoped to whichever category is currently selected
  // — purely real past usage, not a generic seed list. "Other" is always
  // offered first as the stable default bucket (same convention as
  // daily-spends-section.tsx's grouping fallback).
  const selectedCustomCategoryId = customCategoryName
    ? customCategories.find(c => c.name.toLowerCase() === customCategoryName.trim().toLowerCase())?.id ?? null
    : null;
  const scopedPastSubcats = subCategorySuggestions
    .filter(s => customCategoryName ? s.customCategoryId === selectedCustomCategoryId : (s.category === category && !s.customCategoryId))
    .map(s => s.subCategory)
    .filter((s): s is string => !!s && s.toLowerCase() !== "other");
  // A pre-filled suggestion (e.g. Gemini's freeform guess in the Gmail
  // review flow) may not be part of real past usage yet — still needs to
  // render as a selectable/highlighted chip instead of matching nothing.
  const subcatChips = [
    "Other",
    ...new Set([...(subLabel && subLabel.toLowerCase() !== "other" ? [subLabel] : []), ...scopedPastSubcats]),
  ];

  return {
    category, customCategoryName, subLabel, showNewCategory, showNewSubcat,
    setCategory, setCustomCategoryName, setSubLabel, setShowNewCategory, setShowNewSubcat,
    selectBuiltInCategory, selectCustomCategory, selectSubCategory, reset,
    hasCategory, subcatChips,
  };
}

export type CategoryPicker = ReturnType<typeof useCategoryPicker>;
