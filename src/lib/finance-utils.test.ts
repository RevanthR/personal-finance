import { describe, it, expect } from "vitest";
import {
  netAmount,
  effectivePaid,
  isBillPending,
  isPreCloseDate,
  computeMetrics,
  groupProjectedExpenses,
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

describe("computeMetrics", () => {
  it("counts a plain unpaid entry as committed and pending, paid entries as settled", () => {
    const entries = [
      entry({ amount: 1000, isPaid: false }),
      entry({ amount: 500, isPaid: true, paidAmount: 500 }),
    ];
    const m = computeMetrics(entries);
    expect(m.totalCommitted).toBe(1500);
    expect(m.totalPaid).toBe(500);
    expect(m.totalPending).toBe(1000);
    expect(m.pendingCount).toBe(1);
  });

  it("nets cashback out of the committed figure", () => {
    const m = computeMetrics([entry({ amount: 1000, cashbackAmount: 100, isPaid: false })]);
    expect(m.totalCommitted).toBe(900);
  });

  it("paidPercent is paid over committed, capped at 100", () => {
    const m = computeMetrics([
      entry({ amount: 1000, isPaid: true, paidAmount: 1000 }),
      entry({ amount: 1000, isPaid: false }),
    ]);
    expect(m.paidPercent).toBe(50);
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
