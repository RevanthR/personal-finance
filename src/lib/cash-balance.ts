import { db } from "@/lib/db";
import { pendingAmountKicks } from "@/lib/utils";

// Real-time cash on hand = the most recent CashAnchor before `asOf`, plus
// every dated inflow, minus every dated outflow, in the window between the
// two. No frozen per-month carry, no chain — see the design in
// prisma/schema.prisma (CashPayment / CashAnchor). Every screen's cash
// figure goes through getCashBalance().

export type CashBreakdown = {
  balance: number;
  anchorBalance: number;
  anchorAsOf: Date;
  incomeReceived: number;
  billsPaid: number;      // recurring bills, net of reversals
  cardBillsPaid: number;  // card statements, net of reversals
  oneOffSpend: number;    // ad-hoc cash expenses + card repayments, net of refunds
};

export type CashEvent =
  | { kind: "income"; on: Date; amount: number }
  | { kind: "billPayment"; on: Date; amount: number }
  | { kind: "cardPayment"; on: Date; amount: number }
  | { kind: "oneOff"; on: Date; amount: number }; // already signed: spend +, refund -

// Pure. Window is (anchorAsOf, asOf] — anything on or before the anchor is
// already baked into anchorBalance; anything after `asOf` hasn't happened yet.
export function sumCash(
  anchorBalance: number,
  anchorAsOf: Date,
  events: CashEvent[],
  asOf: Date,
): CashBreakdown {
  const lo = anchorAsOf.getTime();
  const hi = asOf.getTime();
  let income = 0, bills = 0, card = 0, oneOff = 0;
  for (const e of events) {
    const t = e.on.getTime();
    if (t <= lo || t > hi) continue;
    if (e.kind === "income") income += e.amount;
    else if (e.kind === "billPayment") bills += e.amount;
    else if (e.kind === "cardPayment") card += e.amount;
    else oneOff += e.amount;
  }
  return {
    balance: Math.round((anchorBalance + income - bills - card - oneOff) * 100) / 100,
    anchorBalance,
    anchorAsOf,
    incomeReceived: Math.round(income * 100) / 100,
    billsPaid: Math.round(bills * 100) / 100,
    cardBillsPaid: Math.round(card * 100) / 100,
    oneOffSpend: Math.round(oneOff * 100) / 100,
  };
}

const daysInUtcMonth = (year: number, month0: number) =>
  new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();

// Noon UTC on the clamped day-of-month, so an income event on the 1st still
// lands strictly after a seed anchor placed at the previous day's midnight.
function incomeDate(year: number, month1: number, day: number): Date {
  const clamped = Math.min(Math.max(1, day), daysInUtcMonth(year, month1 - 1));
  return new Date(Date.UTC(year, month1 - 1, clamped, 12, 0, 0));
}

type IncomeTemplate = {
  id: string;
  amount: number;
  dueDateDay: number | null;
  pendingAmount: number | null;
  pendingFromMonth: number | null;
  pendingFromYear: number | null;
};

type MonthRow = {
  month: number;
  year: number;
  salaryIncome: number;
  adHocItems: {
    type: string;
    amount: number;
    date: Date;
    notes: string | null;
    ccTemplateId: string | null;
    isCredit: boolean;
    isCardRepayment: boolean;
  }[];
};

// Turns a user's populated months into dated income events. Mirrors
// computeMonthIncome's totals (finance-utils.ts), just spread over real
// receipt dates instead of a single monthly lump.
export function incomeEventsFor(months: MonthRow[], incomeTemplates: IncomeTemplate[], payDay: number): CashEvent[] {
  const events: CashEvent[] = [];
  for (const m of months) {
    const overrides = new Map<string, number>();
    for (const item of m.adHocItems) {
      if (item.type !== "INCOME") continue;
      if (item.notes?.startsWith("income_override:")) {
        overrides.set(item.notes.slice("income_override:".length), item.amount);
      } else {
        events.push({ kind: "income", on: item.date, amount: item.amount });
      }
    }
    if (incomeTemplates.length === 0) {
      if (m.salaryIncome) events.push({ kind: "income", on: incomeDate(m.year, m.month, payDay), amount: m.salaryIncome });
      continue;
    }
    for (const t of incomeTemplates) {
      const amount = overrides.has(t.id)
        ? overrides.get(t.id)!
        : (pendingAmountKicks(t, m.month, m.year) ? t.pendingAmount! : t.amount);
      if (amount) events.push({ kind: "income", on: incomeDate(m.year, m.month, t.dueDateDay ?? payDay), amount });
    }
  }
  return events;
}

export function oneOffEventsFor(months: MonthRow[]): CashEvent[] {
  const events: CashEvent[] = [];
  for (const m of months) {
    for (const i of m.adHocItems) {
      if (i.type !== "EXPENSE") continue;
      if (i.isCardRepayment) {
        // Money moved from bank to a card — a real cash outflow.
        events.push({ kind: "oneOff", on: i.date, amount: i.amount });
      } else if (!i.ccTemplateId) {
        // A plain cash spend, or a refund (isCredit) back to cash.
        events.push({ kind: "oneOff", on: i.date, amount: i.isCredit ? -i.amount : i.amount });
      }
      // else: a charge or refund on a card — not cash until the bill is paid.
    }
  }
  return events;
}

/** Cash on hand for `userId` as of `asOf`, with a breakdown for the drilldown. */
export async function getCashBalance(userId: string, asOf: Date = new Date()): Promise<CashBreakdown> {
  const [anchor, user, months, payments, allTemplates] = await Promise.all([
    db.cashAnchor.findFirst({ where: { userId, asOf: { lte: asOf } }, orderBy: { asOf: "desc" } }),
    db.user.findUnique({ where: { id: userId }, select: { payDay: true } }),
    db.month.findMany({
      where: { userId, isPopulated: true },
      select: {
        month: true, year: true, salaryIncome: true,
        adHocItems: { select: { type: true, amount: true, date: true, notes: true, ccTemplateId: true, isCredit: true, isCardRepayment: true } },
      },
    }),
    db.cashPayment.findMany({ where: { userId }, select: { amount: true, paidOn: true, monthlyEntryId: true, cardStatementId: true } }),
    // No `select` here: templateType has historically not been safe to use
    // in a Prisma select/where clause on this project (see CLAUDE.md).
    db.lineItemTemplate.findMany({ where: { userId } }),
  ]);

  const anchorBalance = anchor?.balance ?? 0;
  // No anchor yet (pre-seed / brand-new user): count everything from epoch.
  const anchorAsOf = anchor?.asOf ?? new Date(0);

  const incomeTemplates: IncomeTemplate[] = allTemplates
    .filter(t => t.templateType === "INCOME")
    .map(t => ({ id: t.id, amount: t.amount, dueDateDay: t.dueDateDay, pendingAmount: t.pendingAmount, pendingFromMonth: t.pendingFromMonth, pendingFromYear: t.pendingFromYear }));

  const events: CashEvent[] = [
    ...incomeEventsFor(months, incomeTemplates, user?.payDay ?? 1),
    ...oneOffEventsFor(months),
    ...payments.map((p): CashEvent => ({
      kind: p.cardStatementId ? "cardPayment" : "billPayment",
      on: p.paidOn,
      amount: p.amount,
    })),
  ];

  return sumCash(anchorBalance, anchorAsOf, events, asOf);
}
