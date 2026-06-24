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
};

export const CATEGORY_COLORS: Record<string, string> = {
  HOUSE_MAINTENANCE: "#64748b",
  LOAN:             "#b91c1c",
  CREDIT_CARD:      "#6d28d9",
  CHIT_FUND:        "#b45309",
  SAVINGS:          "#15803d",
  PERSONAL:         "#1d4ed8",
  MISCELLANEOUS:    "#9ca3af",
};
