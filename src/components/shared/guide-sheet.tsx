"use client";

import { X, LayoutDashboard, Calendar, SlidersHorizontal, CreditCard, Coins, Inbox, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const sections = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-100 dark:bg-indigo-500/15",
    lines: [
      "This month at a glance: income, bills, what is still pending, and cash in hand.",
      "Mark each recurring bill as paid once you settle it. If you paid it with a credit card, pick the card so it moves onto that card's bill.",
      'Tap "Add Transaction" to log a one-off spend or income.',
      "Use the arrows to look at past months or a projection of future ones.",
    ],
  },
  {
    icon: Calendar,
    title: "Year View",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-500/15",
    lines: [
      "Your financial year from April to March.",
      "Solid months are real data. Dashed months are estimates from your active recurring items and card spend so far.",
      "Tap any month to see its full breakdown.",
    ],
  },
  {
    icon: CreditCard,
    title: "Cards",
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-100 dark:bg-purple-500/15",
    lines: [
      "Each card shows its latest statement, anything past due, and what you have spent in the cycle that is still open.",
      "Until you confirm it, a statement is estimated from your logged charges. Confirm it with the bank's figure when the statement arrives.",
      'Pay with "Mark paid", or "Paid part" for a partial payment. Money goes to the oldest unpaid statement first.',
      "A payment logged as a transaction (bank transfer or UPI to the card, marked as a card repayment) counts the same way. Use one or the other for a payment, not both.",
      "Tap Statements to see every past cycle and the charges behind it.",
    ],
  },
  {
    icon: Coins,
    title: "Chits & Owed",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    lines: [
      "Chit funds: before you lift, your monthly payment builds savings. After you lift, it is repaying the group.",
      "Owed to you: money others owe you. Set an expected date and that month's forecast includes it. Tap Mark as Received when it arrives.",
    ],
  },
  {
    icon: Inbox,
    title: "Sync",
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-100 dark:bg-teal-500/15",
    lines: [
      "Connect Gmail and bank alert emails turn into suggested transactions.",
      "Nothing is added until you approve it. Card bill payments can be matched to the card so they pay its statement.",
    ],
  },
  {
    icon: SlidersHorizontal,
    title: "Recurring",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-500/15",
    lines: [
      "Items that fill in every month: salary, EMIs, rent, chit contributions.",
      "Add your income sources first so the app can work out what is left each month.",
      "Set a Payment Due Date so you get a reminder and overdue items are flagged.",
      "Removing an item that already has payments archives it, so past months keep their history.",
    ],
  },
  {
    icon: Plus,
    title: "Add Transaction",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-100 dark:bg-rose-500/15",
    lines: [
      "Logs a one-off spend or income. It does not repeat next month.",
      "For a card spend, pick the card. It lands on that card's current cycle and becomes part of the next statement.",
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
          "fixed top-0 right-0 h-dvh w-full max-w-sm z-50 bg-background shadow-2xl flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header — clears Dynamic Island */}
        <div
          className="flex flex-col justify-end border-b shrink-0"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex items-center justify-between px-5 py-4">
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
        </div>

        {/* Scrollable content — clears home indicator */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4 space-y-6"
          style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        >
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
