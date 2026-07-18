import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import {
  Home, Landmark, Users, CreditCard, PiggyBank, User,
  Briefcase, Laptop, Building2, Store, TrendingUp, Gift, Tag,
  Coffee, ShoppingCart, Fuel, ShoppingBag, Plane, HeartPulse, Receipt, Film, UtensilsCrossed,
  Baby, PawPrint, Dumbbell, Tv, Shield, GraduationCap, Car, Smartphone, Wifi, Zap, Droplet,
  HandHeart, Scissors, Star, Bookmark, Layers, Box, Sparkles, Circle, Flag,
  type LucideIcon,
} from "lucide-react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatMonthYear(month: number, year: number): string {
  return format(new Date(year, month - 1, 1), "MMMM yyyy");
}

export function ordinal(day: number): string {
  const v = day % 100;
  if (v >= 11 && v <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

export function getCurrentMonthYear(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export const CATEGORY_LABELS: Record<string, string> = {
  HOUSE_MAINTENANCE: "House Maintenance",
  LOAN: "Loan",
  CHIT_FUND: "Chit Fund",
  CREDIT_CARD: "Credit Card",
  SAVINGS: "Savings",
  PERSONAL: "Personal",
  MISCELLANEOUS: "Family",
  SALARY: "Salary",
  FREELANCE: "Freelance",
  RENTAL: "Rental",
  BUSINESS: "Business",
  INVESTMENTS: "Investments",
  OTHER_INCOME: "Other Income",
};

export function getCategoryDisplay(category: string, customCategory?: string | null): string {
  return customCategory ?? CATEGORY_LABELS[category] ?? category;
}

// A custom category isn't in the fixed enum, so there's no lookup table to
// key off — best-effort keyword match against common real-world category
// names, falling back to a deterministic hash of the name so two different
// custom categories at least look visually distinct from each other (same
// name always maps to the same color+icon) instead of every custom
// category collapsing onto one shared generic look.
const CUSTOM_CATEGORY_KEYWORDS: [RegExp, LucideIcon][] = [
  [/kid|child|baby/i, Baby],
  [/pet|dog|cat\b/i, PawPrint],
  [/travel|trip|vacation|holiday/i, Plane],
  [/gym|fitness|workout/i, Dumbbell],
  [/netflix|spotify|subscription|streaming/i, Tv],
  [/gift/i, Gift],
  [/rent\b/i, Home],
  [/insurance/i, Shield],
  [/school|tuition|education|college/i, GraduationCap],
  [/car|vehicle|bike|scooter/i, Car],
  [/phone|mobile/i, Smartphone],
  [/internet|wifi|broadband/i, Wifi],
  [/electric|power bill/i, Zap],
  [/water bill/i, Droplet],
  [/medical|doctor|hospital|health/i, HeartPulse],
  [/charity|donat/i, HandHeart],
  [/salon|beauty|spa/i, Scissors],
];

const CUSTOM_CATEGORY_ICON_FALLBACKS: LucideIcon[] = [Tag, Star, Bookmark, Layers, Box, Sparkles, Circle, Flag];
const CUSTOM_CATEGORY_COLOR_FALLBACKS = ["#f97316", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f43f5e", "#0ea5e9", "#eab308"];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function customCategoryIcon(name: string): LucideIcon {
  const match = CUSTOM_CATEGORY_KEYWORDS.find(([re]) => re.test(name));
  return match ? match[1] : CUSTOM_CATEGORY_ICON_FALLBACKS[hashString(name) % CUSTOM_CATEGORY_ICON_FALLBACKS.length];
}

function customCategoryColor(name: string): string {
  return CUSTOM_CATEGORY_COLOR_FALLBACKS[hashString(name) % CUSTOM_CATEGORY_COLOR_FALLBACKS.length];
}

export function getCategoryColor(category: string, customCategory?: string | null): string {
  if (customCategory) return customCategoryColor(customCategory);
  return CATEGORY_COLORS[category] ?? "#9ca3af";
}

// Groups items by category — customCategory takes priority as the group
// key when set, same convention getCategoryDisplay/getCategoryColor use.
// Shared by daily-spend-chart.tsx's category series and
// daily-spends-section.tsx's category -> sub-category breakdown, which
// previously each rebuilt this same grouping map independently.
export function groupItemsByCategory<T extends { category: string | null; customCategory: string | null; amount: number }>(
  items: T[]
): { key: string; category: string; customCategory: string | null; items: T[]; total: number }[] {
  const map = new Map<string, { category: string; customCategory: string | null; items: T[] }>();
  for (const item of items) {
    const cat = item.category ?? "MISCELLANEOUS";
    const key = item.customCategory ?? cat;
    if (!map.has(key)) map.set(key, { category: cat, customCategory: item.customCategory, items: [] });
    map.get(key)!.items.push(item);
  }
  return [...map.entries()].map(([key, v]) => ({
    key,
    category: v.category,
    customCategory: v.customCategory,
    items: v.items,
    total: v.items.reduce((s, i) => s + i.amount, 0),
  }));
}

export const CATEGORY_COLORS: Record<string, string> = {
  HOUSE_MAINTENANCE: "#0ea5e9",
  LOAN:             "#f43f5e",
  CREDIT_CARD:      "#a855f7",
  CHIT_FUND:        "#f59e0b",
  SAVINGS:          "#22c55e",
  PERSONAL:         "#3b82f6",
  MISCELLANEOUS:    "#fb923c",
  SALARY:           "#10b981",
  FREELANCE:        "#06b6d4",
  RENTAL:           "#d946ef",
  BUSINESS:         "#ec4899",
  INVESTMENTS:      "#14b8a6",
  OTHER_INCOME:     "#94a3b8",
};

// Mirrors the sidebar's per-item icon-circle pattern (sidebar.tsx) so
// categories are recognizable by icon+color everywhere in the app, not
// just in nav. Custom (user-created) categories always get the generic
// Tag icon — there's no way to know what a freeform name like "Kids" means.
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  HOUSE_MAINTENANCE: Home,
  LOAN: Landmark,
  CHIT_FUND: Users,
  CREDIT_CARD: CreditCard,
  SAVINGS: PiggyBank,
  PERSONAL: User,
  MISCELLANEOUS: Baby,
  SALARY: Briefcase,
  FREELANCE: Laptop,
  RENTAL: Building2,
  BUSINESS: Store,
  INVESTMENTS: TrendingUp,
  OTHER_INCOME: Gift,
};

export function getCategoryIcon(category: string, customCategory?: string | null): LucideIcon {
  if (customCategory) return customCategoryIcon(customCategory);
  return CATEGORY_ICONS[category] ?? Tag;
}

// Best-effort icon match for the free-text sub-category field — covers the
// common labels users actually accumulate, falls back to a generic tag for
// anything else since sub-categories aren't a closed set.
export const SUBCATEGORY_ICONS: Record<string, LucideIcon> = {
  Food: UtensilsCrossed,
  Coffee: Coffee,
  Groceries: ShoppingCart,
  Fuel: Fuel,
  Shopping: ShoppingBag,
  Travel: Plane,
  Health: HeartPulse,
  Bills: Receipt,
  Entertainment: Film,
};

export function getSubCategoryIcon(subCategory: string): LucideIcon {
  return SUBCATEGORY_ICONS[subCategory] ?? Tag;
}

export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

export function pendingAmountKicks(
  t: { pendingAmount: number | null; pendingFromMonth: number | null; pendingFromYear: number | null },
  month: number,
  year: number,
): boolean {
  if (t.pendingAmount == null || t.pendingFromMonth == null || t.pendingFromYear == null) return false;
  return year > t.pendingFromYear || (year === t.pendingFromYear && month >= t.pendingFromMonth);
}

export const EXPENSE_CATEGORIES = [
  "HOUSE_MAINTENANCE", "LOAN", "CHIT_FUND", "CREDIT_CARD", "SAVINGS", "PERSONAL", "MISCELLANEOUS",
] as const;

// Chip-shaped category picker options for the add-expense wizard and the
// Gmail-import review form — CREDIT_CARD is deliberately excluded here,
// since payment method (cash/UPI vs card) is its own separate chip step in
// both flows, not a category. Single source of truth for both.
export const EXPENSE_CATEGORY_CHIPS = [
  { value: "HOUSE_MAINTENANCE", label: "House" },
  { value: "LOAN",              label: "Loan" },
  { value: "PERSONAL",          label: "Personal" },
  { value: "MISCELLANEOUS",     label: "Family" },
] as const;

export const INCOME_CATEGORIES = [
  "SALARY", "FREELANCE", "RENTAL", "BUSINESS", "INVESTMENTS", "OTHER_INCOME",
] as const;
