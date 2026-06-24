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
  HOUSE_MAINTENANCE: "#6366f1",
  LOAN: "#f43f5e",
  CHIT_FUND: "#f59e0b",
  CREDIT_CARD: "#8b5cf6",
  SAVINGS: "#10b981",
  PERSONAL: "#3b82f6",
  MISCELLANEOUS: "#6b7280",
};
