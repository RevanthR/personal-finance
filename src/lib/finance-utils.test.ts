import { describe, it, expect } from "vitest";
import {
  netAmount,
  effectivePaid,
  isBillPending,
  isPreCloseDate,
  carriedDebtAmount,
  computeCashBalance,
  isZeroCCBalance,
  computeMetrics,
  groupProjectedExpenses,
  reconcileCard,
  type EntryBase,
} from "./finance-utils";

// Minimal EntryBase with sensible defaults — each test only overrides the
// fields it actually cares about, so the intent of a given case stays
// readable instead of buried in boilerplate.
function entry(overrides: Partial<EntryBase> & { template?: Partial<EntryBase["template"]> } = {}): EntryBase {
  return {
    amount: 0,
    isPaid: false,
    paidAmount: null,
    cashbackAmount: null,
    statementAmount: null,
    billedAmount: null,
    carriedInAmount: null,
    billPaymentsAttributed: null,
    paidViaCardTemplateId: null,
    ...overrides,
    template: {
      category: "PERSONAL",
      statementDay: null,
      ...overrides.template,
    },
  };
}

describe("netAmount", () => {
  it("subtracts cashback from the raw amount", () => {
    expect(netAmount({ amount: 1000, cashbackAmount: 50 })).toBe(950);
  });
  it("treats a null cashback as zero", () => {
    expect(netAmount({ amount: 1000, cashbackAmount: null })).toBe(1000);
  });
});

describe("effectivePaid", () => {
  it("returns paidAmount for an unpaid entry with a partial payment", () => {
    expect(effectivePaid({ amount: 1000, cashbackAmount: null, isPaid: false, paidAmount: 300 })).toBe(300);
  });
  it("returns 0 for an unpaid entry with no payment yet", () => {
    expect(effectivePaid({ amount: 1000, cashbackAmount: null, isPaid: false, paidAmount: null })).toBe(0);
  });
  it("trusts an overpayment recorded on a paid entry", () => {
    expect(effectivePaid({ amount: 1000, cashbackAmount: null, isPaid: true, paidAmount: 1200 })).toBe(1200);
  });
  it("ignores a stale partial paidAmount smaller than the net amount once paid", () => {
    // isPaid flipped true but paidAmount was never updated to the full
    // amount — the net amount wins, not the stale partial figure.
    expect(effectivePaid({ amount: 1000, cashbackAmount: null, isPaid: true, paidAmount: 300 })).toBe(1000);
  });
  it("falls back to net amount when paid with no paidAmount recorded at all", () => {
    expect(effectivePaid({ amount: 1000, cashbackAmount: 100, isPaid: true, paidAmount: null })).toBe(900);
  });
});

describe("isBillPending", () => {
  it("is true only for a CREDIT_CARD entry, in the current month, before its statement day", () => {
    const e = entry({ template: { category: "CREDIT_CARD", statementDay: 15 } });
    expect(isBillPending(e, true, 10)).toBe(true);
  });
  it("is false once today reaches the statement day", () => {
    const e = entry({ template: { category: "CREDIT_CARD", statementDay: 15 } });
    expect(isBillPending(e, true, 15)).toBe(false);
  });
  it("is false for a non-current month even if the day would otherwise qualify", () => {
    const e = entry({ template: { category: "CREDIT_CARD", statementDay: 15 } });
    expect(isBillPending(e, false, 10)).toBe(false);
  });
  it("is false for a non-CREDIT_CARD entry regardless of statementDay", () => {
    const e = entry({ template: { category: "PERSONAL", statementDay: 15 } });
    expect(isBillPending(e, true, 10)).toBe(false);
  });
  it("is false when the template has no statementDay set", () => {
    const e = entry({ template: { category: "CREDIT_CARD", statementDay: null } });
    expect(isBillPending(e, true, 10)).toBe(false);
  });
});

describe("isPreCloseDate", () => {
  it("is true for a date strictly before the statement day", () => {
    expect(isPreCloseDate(new Date(2026, 7, 12), 15)).toBe(true);
  });
  it("is false for a date exactly on the statement day (already missed the cut)", () => {
    expect(isPreCloseDate(new Date(2026, 7, 15), 15)).toBe(false);
  });
  it("is false for a date after the statement day", () => {
    expect(isPreCloseDate(new Date(2026, 7, 20), 15)).toBe(false);
  });
  it("is false when there's no statementDay", () => {
    expect(isPreCloseDate(new Date(2026, 7, 12), null)).toBe(false);
  });
});

describe("carriedDebtAmount", () => {
  it("is the carried-in amount net of cashback while the bill is still pending", () => {
    const e = entry({
      template: { category: "CREDIT_CARD", statementDay: 15 },
      carriedInAmount: 5000,
      cashbackAmount: 200,
    });
    expect(carriedDebtAmount(e, true, 10)).toBe(4800);
  });
  it("floors at 0 rather than going negative", () => {
    const e = entry({
      template: { category: "CREDIT_CARD", statementDay: 15 },
      carriedInAmount: 100,
      cashbackAmount: 500,
    });
    expect(carriedDebtAmount(e, true, 10)).toBe(0);
  });
  it("is 0 once the bill is no longer pending, even with a carried-in amount", () => {
    const e = entry({
      template: { category: "CREDIT_CARD", statementDay: 15 },
      carriedInAmount: 5000,
    });
    expect(carriedDebtAmount(e, true, 20)).toBe(0);
  });
});

describe("computeCashBalance", () => {
  it("adds opening balance and income, subtracts expense and carried-debt payments", () => {
    expect(computeCashBalance({ openingBalance: 1000, income: 5000, expense: 3000, carriedDebtPaid: 500 })).toBe(2500);
  });
  it("can go negative, this is the exact bug fixed this session (dashboard used to floor it at 0)", () => {
    expect(computeCashBalance({ openingBalance: 0, income: 1000, expense: 5000, carriedDebtPaid: 0 })).toBe(-4000);
  });
});

describe("isZeroCCBalance", () => {
  it("is true with no spend and no carried debt", () => {
    expect(isZeroCCBalance(0, 0, 0)).toBe(true);
  });
  it("is true when cashback fully offsets the amount", () => {
    expect(isZeroCCBalance(500, 0, 500)).toBe(true);
  });
  it("is false with any real carried-in debt, even at zero current spend", () => {
    expect(isZeroCCBalance(0, 100, 0)).toBe(false);
  });
  it("is false with positive spend after cashback", () => {
    expect(isZeroCCBalance(1000, 0, 200)).toBe(false);
  });
});

describe("computeMetrics", () => {
  it("counts a plain unpaid entry as committed and pending, paid entries as settled", () => {
    const entries = [
      entry({ amount: 1000, isPaid: false }),
      entry({ amount: 500, isPaid: true, paidAmount: 500 }),
    ];
    const m = computeMetrics(entries, true, 10);
    expect(m.totalCommitted).toBe(1500);
    expect(m.totalPaid).toBe(500);
    expect(m.pendingCount).toBe(1);
  });

  it("keeps a pending (unclosed) CC bill's carried debt out of totalCommitted but in totalPending", () => {
    const entries = [
      entry({
        template: { category: "CREDIT_CARD", statementDay: 15 },
        amount: 2000, // this cycle's still-building spend
        carriedInAmount: 3000, // real debt from last cycle
      }),
    ];
    const m = computeMetrics(entries, true, 10); // before statementDay 15 — still pending
    expect(m.totalCommitted).toBe(0);
    expect(m.carriedCCDebt).toBe(3000);
    expect(m.totalPending).toBe(3000);
  });

  it("moves a CC entry's own committed amount into ccBillsThisMonth once its statement has closed", () => {
    const entries = [
      entry({
        template: { category: "CREDIT_CARD", statementDay: 15 },
        amount: 2000,
        billedAmount: 2000,
      }),
    ];
    const m = computeMetrics(entries, true, 20); // past statementDay 15 — closed, a real bill now
    expect(m.totalCommitted).toBe(2000);
    expect(m.ccBillsThisMonth).toBe(2000);
    expect(m.recurringNonCC).toBe(0);
  });

  it("excludes a bill paid via a card from cash totals without touching committed/paid", () => {
    const entries = [
      entry({ amount: 1000, isPaid: true, paidAmount: 1000, paidViaCardTemplateId: "card-1" }),
    ];
    const m = computeMetrics(entries, true, 10);
    expect(m.totalCommitted).toBe(1000);
    expect(m.totalPaid).toBe(1000);
    expect(m.cashCommitted).toBe(0);
    expect(m.cashPaid).toBe(0);
  });

  it("excludes a card's billPaymentsAttributed portion from committed/paid but keeps it in cash", () => {
    const entries = [
      entry({
        template: { category: "CREDIT_CARD", statementDay: 15 },
        amount: 5000,
        billedAmount: 5000,
        billPaymentsAttributed: 2000, // 2000 of this bill is really another bill routed through the card
      }),
    ];
    const m = computeMetrics(entries, true, 20); // closed
    expect(m.totalCommitted).toBe(3000); // 5000 - 2000 attributed
    expect(m.cashCommitted).toBe(5000); // full amount still moves as real cash
  });
});

describe("groupProjectedExpenses", () => {
  type PE = { name: string; amount: number; category: string; customCategory: string | null; isFixed: boolean; dueDateDay: number | null };
  const pe = (o: Partial<PE> = {}): PE => ({
    name: "Item",
    amount: 100,
    category: "PERSONAL",
    customCategory: null,
    isFixed: false,
    dueDateDay: null,
    ...o,
  });

  it("returns empty groups for no entries", () => {
    const g = groupProjectedExpenses([]);
    expect(g).toEqual({ categories: [], cc: [], ccTotal: 0, fixed: 0, variable: 0, total: 0 });
  });

  it("groups non-CC entries by category and sorts categories by total desc", () => {
    const g = groupProjectedExpenses([
      pe({ name: "Rent", category: "HOUSE_MAINTENANCE", amount: 20000 }),
      pe({ name: "Netflix", category: "PERSONAL", amount: 500 }),
      pe({ name: "Gym", category: "PERSONAL", amount: 1500 }),
    ]);
    expect(g.categories.map(c => c.key)).toEqual(["HOUSE_MAINTENANCE", "PERSONAL"]);
    expect(g.categories[1].items.map(i => i.name)).toEqual(["Gym", "Netflix"]); // amount desc
    expect(g.categories[1].total).toBe(2000);
    expect(g.total).toBe(22000);
  });

  it("buckets by customCategory when set, keeping it separate from the base category", () => {
    const g = groupProjectedExpenses([
      pe({ name: "Kid fees", category: "PERSONAL", customCategory: "Kids", amount: 3000 }),
      pe({ name: "Coffee", category: "PERSONAL", customCategory: null, amount: 400 }),
    ]);
    expect(g.categories.map(c => c.key).sort()).toEqual(["Kids", "PERSONAL"]);
  });

  it("splits CREDIT_CARD entries into cc, out of categories, and sorts them by amount desc", () => {
    const g = groupProjectedExpenses([
      pe({ name: "Amex", category: "CREDIT_CARD", amount: 12000 }),
      pe({ name: "HDFC", category: "CREDIT_CARD", amount: 8000 }),
      pe({ name: "Rent", category: "HOUSE_MAINTENANCE", amount: 20000 }),
    ]);
    expect(g.cc.map(c => c.name)).toEqual(["Amex", "HDFC"]);
    expect(g.ccTotal).toBe(20000);
    expect(g.categories.map(c => c.key)).toEqual(["HOUSE_MAINTENANCE"]);
    expect(g.total).toBe(40000);
  });

  it("computes fixed/variable across every entry, CC included", () => {
    const g = groupProjectedExpenses([
      pe({ category: "HOUSE_MAINTENANCE", amount: 20000, isFixed: true }),
      pe({ category: "CREDIT_CARD", amount: 5000, isFixed: true }),
      pe({ category: "PERSONAL", amount: 3000, isFixed: false }),
    ]);
    expect(g.fixed).toBe(25000);
    expect(g.variable).toBe(3000);
    expect(g.fixed + g.variable).toBe(g.total);
  });
});

describe("reconcileCard", () => {
  const txn = (date: string, amount: number, isCredit = false) => ({ date, amount, isCredit });

  it("flags a generated bill whose captured charges exceed the billed amount", () => {
    // Axis-shaped: statement day 1, bill generated, bank billed less than the
    // itemised charges add up to (late-August spend the bank cut before).
    const r = reconcileCard(
      { amount: 63651, billedAmount: 63651, statementAmount: 245, carriedInAmount: 0, cashbackAmount: 0 },
      1,
      false,
      [
        txn("2026-08-10", 30000), txn("2026-08-20", 20000), txn("2026-08-31", 13931),
        txn("2026-09-02", 245),
      ],
      new Date("2026-09-05T12:00:00"),
    );
    expect(r.bill).toBe(63651);
    expect(r.accumulating).toBe(245);
    expect(r.capturedBill).toBe(63931);
    expect(r.capturedAccumulating).toBe(245);
    expect(r.billGap).toBe(-280);
    expect(r.hasBillGap).toBe(true);
    expect(r.hasAccumulatingGap).toBe(false);
  });

  it("flags a pending cycle whose ledger amount is stale below the captured spend", () => {
    // Amazon Pay-shaped: statement day 2, bill not generated, two late charges
    // landed after the next month's opening balance was frozen.
    const r = reconcileCard(
      { amount: 3421, billedAmount: 3421, statementAmount: 0, carriedInAmount: 0, cashbackAmount: 0 },
      2,
      true,
      [
        txn("2026-08-13", 2399), txn("2026-08-23", 1022),
        txn("2026-08-28", 550), txn("2026-08-28", 420),
      ],
      new Date("2026-09-01T12:00:00"),
    );
    expect(r.bill).toBe(0); // pending: only carried debt is owed
    expect(r.accumulating).toBe(3421); // buildingThisCycle = amount - carriedIn
    expect(r.capturedAccumulating).toBe(4391);
    expect(r.billGap).toBe(0); // no generated bill to reconcile
    expect(r.accumulatingGap).toBe(-970);
    expect(r.hasAccumulatingGap).toBe(true);
  });

  it("reports no gap when the ledger and the captured charges agree", () => {
    const r = reconcileCard(
      { amount: 5000, billedAmount: 5000, statementAmount: 1200, carriedInAmount: 0, cashbackAmount: 0 },
      5,
      false,
      [
        txn("2026-08-15", 3000), txn("2026-08-28", 2000), // bill window [Aug 5, Sep 5)
        txn("2026-09-06", 1200), // accumulating >= Sep 5
      ],
      new Date("2026-09-10T12:00:00"),
    );
    expect(r.capturedBill).toBe(5000);
    expect(r.capturedAccumulating).toBe(1200);
    expect(r.hasBillGap).toBe(false);
    expect(r.hasAccumulatingGap).toBe(false);
    expect(r.totalOutstanding).toBe(6200);
  });

  it("nets cashback out of the bill and utilization but compares gaps gross", () => {
    const r = reconcileCard(
      { amount: 10000, billedAmount: 10000, statementAmount: 0, carriedInAmount: 0, cashbackAmount: 300 },
      1,
      false,
      [txn("2026-08-10", 10000)],
      new Date("2026-09-05T12:00:00"),
    );
    expect(r.bill).toBe(9700); // 10000 - 300 cashback
    expect(r.utilization).toBe(9700);
    expect(r.capturedBill).toBe(10000);
    expect(r.billGap).toBe(0); // (9700 + 300) - 10000
    expect(r.hasBillGap).toBe(false);
  });

  it("treats a credit-note transaction as reducing the captured total", () => {
    const r = reconcileCard(
      { amount: 4000, billedAmount: 4000, statementAmount: 0, carriedInAmount: 0, cashbackAmount: 0 },
      1,
      false,
      [txn("2026-08-10", 5000), txn("2026-08-15", 1000, true)],
      new Date("2026-09-05T12:00:00"),
    );
    expect(r.capturedBill).toBe(4000); // 5000 - 1000 refund
    expect(r.hasBillGap).toBe(false);
  });

  it("puts everything in the bill window when the card has no statement day", () => {
    const r = reconcileCard(
      { amount: 2000, billedAmount: null, statementAmount: null, carriedInAmount: 0, cashbackAmount: 0 },
      null,
      false,
      [txn("2026-08-01", 1200), txn("2026-09-01", 800)],
      new Date("2026-09-10T12:00:00"),
    );
    expect(r.capturedBill).toBe(2000);
    expect(r.capturedAccumulating).toBe(0);
    expect(r.hasBillGap).toBe(false);
  });
});
