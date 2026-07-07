import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

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
  MISCELLANEOUS: "Miscellaneous",
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

export function getCategoryColor(category: string, customCategory?: string | null): string {
  return customCategory ? "#9ca3af" : (CATEGORY_COLORS[category] ?? "#9ca3af");
}

export const CATEGORY_COLORS: Record<string, string> = {
  HOUSE_MAINTENANCE: "#64748b",
  LOAN:             "#b91c1c",
  CREDIT_CARD:      "#6d28d9",
  CHIT_FUND:        "#b45309",
  SAVINGS:          "#15803d",
  PERSONAL:         "#1d4ed8",
  MISCELLANEOUS:    "#9ca3af",
  SALARY:           "#059669",
  FREELANCE:        "#0891b2",
  RENTAL:           "#7c3aed",
  BUSINESS:         "#d97706",
  INVESTMENTS:      "#0d9488",
  OTHER_INCOME:     "#6b7280",
};

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

export const INCOME_CATEGORIES = [
  "SALARY", "FREELANCE", "RENTAL", "BUSINESS", "INVESTMENTS", "OTHER_INCOME",
] as const;
