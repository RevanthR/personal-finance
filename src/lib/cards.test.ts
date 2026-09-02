import { describe, it, expect } from "vitest";
import {
  statementDateFor,
  currentCycleOpen,
  nextCycleClose,
  dueDateFor,
  cardStatus,
  type CardCharge,
  type CardStatementRow,
} from "./cards";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("cycle date math", () => {
  it("clamps a statement day past the end of the month", () => {
    expect(iso(statementDateFor(2026, 1, 31))).toBe("2026-02-28"); // Feb
    expect(iso(statementDateFor(2026, 3, 31))).toBe("2026-04-30"); // Apr
    expect(iso(statementDateFor(2026, 0, 15))).toBe("2026-01-15");
  });

  it("currentCycleOpen is this month's statement date once it has passed, else last month's", () => {
    expect(iso(currentCycleOpen(2, new Date("2026-09-05")))).toBe("2026-09-02");
    expect(iso(currentCycleOpen(2, new Date("2026-09-01")))).toBe("2026-08-02");
    expect(iso(currentCycleOpen(2, new Date("2026-09-02")))).toBe("2026-09-02"); // day-of counts
  });

  it("nextCycleClose is one month after the open date", () => {
    expect(iso(nextCycleClose(2, new Date("2026-09-05")))).toBe("2026-10-02");
    expect(iso(nextCycleClose(2, new Date("2026-09-01")))).toBe("2026-09-02");
  });

  it("dueDateFor wraps to next month when the due day is earlier than the statement day", () => {
    // cuts 25th, due 5th -> due next month's 5th
    expect(iso(dueDateFor(new Date("2026-09-25"), 25, 5))).toBe("2026-10-05");
    // cuts 2nd, due 20th -> same month
    expect(iso(dueDateFor(new Date("2026-09-02"), 2, 20))).toBe("2026-09-20");
  });
});

// ── cardStatus ──────────────────────────────────────────────────────────────

const charge = (date: string, amount: number, isCredit = false): CardCharge => ({ date, amount, isCredit });

function row(overrides: Partial<CardStatementRow> & { statementDate: string }): CardStatementRow {
  return {
    paymentDueDate: overrides.statementDate,
    statementBalance: null,
    confirmedAt: null,
    paidAmount: 0,
    paidInFull: false,
    cashback: 0,
    ...overrides,
  };
}

describe("cardStatus", () => {
  const card = { statementDay: 2, dueDateDay: 20, creditLimit: 410000 };

  it("a brand-new card with only open-cycle spend is 'open', nothing due", () => {
    const r = cardStatus(card, [], [charge("2026-09-04", 1200)], new Date("2026-09-06"));
    expect(r.status).toBe("open");
    expect(r.unbilledSpends).toBe(1200);
    expect(r.statementBalance).toBe(0);
    expect(r.currentBalance).toBe(1200);
  });

  it("Amazon Pay: statement cut, not yet confirmed -> 'awaiting', estimated from charges", () => {
    const charges = [
      charge("2026-08-13", 2399),
      charge("2026-08-23", 1022),
      charge("2026-08-28", 550),
      charge("2026-08-28", 420),
    ];
    const r = cardStatus(card, [], charges, new Date("2026-09-03"));
    expect(r.status).toBe("awaiting");
    expect(r.statementConfirmed).toBe(false);
    expect(r.statementBalance).toBe(4391); // 2399+1022+550+420
    expect(r.statementEstimated).toBe(4391);
    expect(r.unbilledSpends).toBe(0); // nothing dated on/after Sep 2
    expect(iso(r.lastStatementDate!)).toBe("2026-09-02");
    expect(iso(r.paymentDueDate!)).toBe("2026-09-20");
  });

  it("once confirmed, the bank figure wins over the charge sum", () => {
    const charges = [
      charge("2026-08-13", 2399), charge("2026-08-23", 1022),
      charge("2026-08-28", 550), charge("2026-08-28", 420),
    ];
    const statements = [row({ statementDate: "2026-09-02", paymentDueDate: "2026-09-20", statementBalance: 4050, confirmedAt: "2026-09-03" })];
    const r = cardStatus(card, statements, charges, new Date("2026-09-05"));
    expect(r.status).toBe("confirmed");
    expect(r.statementConfirmed).toBe(true);
    expect(r.statementBalance).toBe(4050);       // bank
    expect(r.statementEstimated).toBe(4391);     // charges, kept for reconciliation
  });

  it("nets payment and cashback out of the statement balance", () => {
    const charges = [charge("2026-08-10", 5000)];
    const statements = [row({ statementDate: "2026-09-02", statementBalance: 5000, confirmedAt: "2026-09-03", paidAmount: 2000, cashback: 300 })];
    const r = cardStatus(card, statements, charges, new Date("2026-09-05"));
    expect(r.statementBalance).toBe(2700); // 5000 - 2000 - 300
    expect(r.status).toBe("confirmed");
  });

  it("paidInFull -> 'paid', current balance is just this cycle's unbilled spend", () => {
    const charges = [charge("2026-08-10", 5000), charge("2026-09-06", 800)];
    const statements = [row({ statementDate: "2026-09-02", statementBalance: 5000, confirmedAt: "2026-09-03", paidAmount: 5000, paidInFull: true })];
    const r = cardStatus(card, statements, charges, new Date("2026-09-08"));
    expect(r.status).toBe("paid");
    expect(r.statementBalance).toBe(0);
    expect(r.unbilledSpends).toBe(800);
    expect(r.currentBalance).toBe(800);
  });

  it("an earlier statement past its due date and unpaid -> 'pastdue', added to current balance", () => {
    const charges = [charge("2026-07-10", 3000), charge("2026-08-15", 4000)];
    const statements = [
      row({ statementDate: "2026-08-02", paymentDueDate: "2026-08-20", statementBalance: 3000, confirmedAt: "2026-08-03", paidAmount: 1000 }),
    ];
    const r = cardStatus(card, statements, charges, new Date("2026-09-05"));
    expect(r.pastDue).toBe(2000); // 3000 - 1000, due date 20 Aug is past
    expect(r.status).toBe("pastdue");
    expect(r.currentBalance).toBe(r.statementBalance + r.unbilledSpends + 2000);
  });

  it("credit-note charges reduce the estimate", () => {
    const charges = [charge("2026-08-10", 5000), charge("2026-08-15", 1000, true)];
    const r = cardStatus(card, [], charges, new Date("2026-09-03"));
    expect(r.statementEstimated).toBe(4000);
  });

  it("utilisation and available credit come off current balance and the limit", () => {
    const charges = [charge("2026-08-10", 100000), charge("2026-09-06", 5000)];
    const statements = [row({ statementDate: "2026-09-02", statementBalance: 100000, confirmedAt: "2026-09-03" })];
    const r = cardStatus(card, statements, charges, new Date("2026-09-08"));
    expect(r.currentBalance).toBe(105000);
    expect(r.availableCredit).toBe(305000);
    expect(r.utilisation).toBeCloseTo(105000 / 410000, 5);
  });

  it("a card with no statement day is 'unconfigured' and shows all spend as unbilled", () => {
    const r = cardStatus({ statementDay: null, dueDateDay: null, creditLimit: 100000 }, [], [charge("2026-08-01", 1200), charge("2026-09-01", 800)], new Date("2026-09-10"));
    expect(r.status).toBe("unconfigured");
    expect(r.unbilledSpends).toBe(2000);
    expect(r.utilisation).toBeCloseTo(0.02, 5);
  });

  it("statement day 1: the cycle is exactly the calendar month", () => {
    const axis = { statementDay: 1, dueDateDay: 21, creditLimit: 170000 };
    const charges = [charge("2026-08-10", 60000), charge("2026-08-31", 3931), charge("2026-09-01", 245)];
    const r = cardStatus(axis, [], charges, new Date("2026-09-05"));
    expect(r.statementEstimated).toBe(63931); // all of August
    expect(r.unbilledSpends).toBe(245);       // 1 Sep onward
    expect(iso(r.paymentDueDate!)).toBe("2026-09-21");
  });
});
