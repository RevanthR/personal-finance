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
      "Your monthly view of income, expenses, and what is left over.",
      "Mark each recurring item as paid once you settle it.",
      "The progress bar shows how many items are settled this month.",
      'Tap "Add Transaction" to log a one-off spend or income that will not repeat next month.',
    ],
  },
  {
    icon: Calendar,
    title: "Monthly View",
    color: "text-blue-500",
    bg: "bg-blue-50",
    lines: [
      "Shows your full financial year from April to March.",
      "Solid months are real data. Dashed months are estimates based on your active items.",
      "Tap any past month to see its full breakdown.",
      "The chart shows income vs. expenses and your running balance through the year.",
    ],
  },
  {
    icon: SlidersHorizontal,
    title: "Configuration",
    color: "text-violet-500",
    bg: "bg-violet-50",
    lines: [
      "Set up recurring items that auto-fill every month: salary, EMIs, rent, credit card bills, chit contributions.",
      "Add your income sources first so the app can calculate your monthly leftover correctly.",
      "Set a due date on any item so the Dashboard can flag it when it is overdue.",
      "Yearly items like insurance only appear in the month they are due.",
      'Tap "Foreclose" on a loan once it is fully paid. It will stop showing up in future months.',
    ],
  },
  {
    icon: TrendingUp,
    title: "Receivables",
    color: "text-emerald-500",
    bg: "bg-emerald-50",
    lines: [
      "Track money that others owe you. This includes personal loans and chit fund lifts.",
      "Set an expected date and that month's forecast will include this amount as income.",
      "Tap Mark as Received when the money comes in. It gets added as income for that month.",
    ],
  },
  {
    icon: Coins,
    title: "Chit Funds",
    color: "text-amber-500",
    bg: "bg-amber-50",
    lines: [
      "A group savings scheme where every member pays in monthly and takes turns receiving the full pot.",
      "Before you lift: your monthly payment is treated as savings, not an expense.",
      "After you lift: your monthly payment becomes an expense since you are paying back the group.",
      "Track total value, savings built up, and lift history from this page.",
    ],
  },
  {
    icon: Plus,
    title: "Add Transaction",
    color: "text-rose-500",
    bg: "bg-rose-50",
    lines: [
      "Logs a one-off item for the current month only. It will not carry over to next month.",
      "Expense types: House, Loan, Credit Card, Personal, Misc.",
      "For credit card spends, pick the card and a spend type like Food or Travel. These are grouped under that card and roll into next month's bill.",
      "Income types: Bonus, Freelance, Refund, Other. These are added directly to this month's income.",
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
