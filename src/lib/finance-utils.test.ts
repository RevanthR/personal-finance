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
