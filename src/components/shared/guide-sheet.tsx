"use client";

import { X, LayoutDashboard, Calendar, SlidersHorizontal, TrendingUp, Coins, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const sections = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    color: "text-indigo-500",
    bg: "bg-indigo-50",
    lines: [
      "Your monthly snapshot — income, recurring expenses, and what's left over.",
      "Mark recurring items as paid as you settle them through the month.",
      "The progress bar at the top shows how many recurring items are settled vs. still pending.",
      "Use "Add Transaction" for one-off spends (a cash purchase, a bonus) that don't repeat.",
    ],
  },
  {
    icon: Calendar,
    title: "Monthly View",
    color: "text-blue-500",
    bg: "bg-blue-50",
    lines: [
      "Your full financial year (Apr – Mar) in one view.",
      "Solid months are past actuals. Dashed months are projections based on your active configuration items.",
      "Click any past month to drill into its full breakdown.",
      "The chart overlays income vs. expenses and tracks your running balance across the year.",
    ],
  },
  {
    icon: SlidersHorizontal,
    title: "Configuration",
    color: "text-violet-500",
    bg: "bg-violet-50",
    lines: [
      "Recurring items that auto-fill every month — salary, EMIs, rent, credit card bills, chit contributions.",
      "Add your income sources first so Dashboard can calculate your leftover accurately.",
      "Set a due date on expense items and the Dashboard will flag what's overdue.",
      "Yearly items (like insurance premiums) appear only in the month they're due.",
      "Use "Foreclose" to settle and close a loan — it stops appearing in future months.",
    ],
  },
  {
    icon: TrendingUp,
    title: "Receivables",
    color: "text-emerald-500",
    bg: "bg-emerald-50",
    lines: [
      "Track money others owe you — personal loans you've given and chit lifts you're waiting on.",
      "Set an expected date and the Monthly View will include it in that month's income projection.",
      "Mark as received when the money arrives — it's added as income to that month's Dashboard.",
    ],
  },
  {
    icon: Coins,
    title: "Chit Funds",
    color: "text-amber-500",
    bg: "bg-amber-50",
    lines: [
      "A chit fund is a rotating savings scheme — every member contributes monthly and takes turns lifting the full pot.",
      "Before your lift: your contribution is treated as a savings investment, not an expense.",
      "After your lift: your contribution becomes an expense as you pay back the group.",
      "Track total value, accumulated savings, and lift history from this page.",
    ],
  },
  {
    icon: Plus,
    title: "Add Transaction",
    color: "text-rose-500",
    bg: "bg-rose-50",
    lines: [
      "Logs a one-time item for the current month — it doesn't repeat next month.",
      "Expense categories: House, Loan, Credit Card, Personal, Misc.",
      "For credit card spends, pick the card and a category (Food, Travel, etc.). These group under the card on Dashboard and carry forward to next month's bill automatically.",
      "Income types: Bonus, Freelance, Refund, Other — added directly to this month's income total.",
    ],
  },
];

interface GuidePanelProps {
  open: boolean;
  onClose: () => void;
}

export function GuidePanel({ open, onClose }: GuidePanelProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full max-w-sm z-50 bg-background shadow-2xl flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <p className="font-semibold text-base">App Guide</p>
            <p className="text-xs text-muted-foreground">How each feature works</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            aria-label="Close guide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 pb-10">
          {sections.map(({ icon: Icon, title, color, bg, lines }) => (
            <div key={title}>
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0", bg)}>
                  <Icon className={cn("w-3.5 h-3.5", color)} />
                </div>
                <p className="text-sm font-semibold">{title}</p>
              </div>
              <ul className="space-y-1.5 pl-8">
                {lines.map((line, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-relaxed list-disc">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
