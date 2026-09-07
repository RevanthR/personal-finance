import { describe, it, expect } from "vitest";
import { sumCash, incomeEventsFor, oneOffEventsFor, type CashEvent } from "./cash-balance";

const d = (s: string) => new Date(s);

describe("sumCash", () => {
  const anchor = d("2026-03-31T00:00:00Z");

  it("balance = anchor + income − every outflow in the window", () => {
    const events: CashEvent[] = [
      { kind: "income", on: d("2026-04-01T12:00:00Z"), amount: 100000 },
      { kind: "billPayment", on: d("2026-04-05T00:00:00Z"), amount: 20000 },
      { kind: "cardPayment", on: d("2026-04-10T00:00:00Z"), amount: 15000 },
      { kind: "oneOff", on: d("2026-04-12T00:00:00Z"), amount: 3000 },
    ];
    const r = sumCash(0, anchor, events, d("2026-04-30T00:00:00Z"));
    expect(r.balance).toBe(62000);
    expect(r.incomeReceived).toBe(100000);
    expect(r.billsPaid).toBe(20000);
    expect(r.cardBillsPaid).toBe(15000);
    expect(r.oneOffSpend).toBe(3000);
  });

  it("ignores events on or before the anchor (already baked in)", () => {
    const events: CashEvent[] = [
      { kind: "income", on: anchor, amount: 999 },
      { kind: "billPayment", on: d("2026-03-01T00:00:00Z"), amount: 500 },
      { kind: "income", on: d("2026-04-01T12:00:00Z"), amount: 5000 },
    ];
    expect(sumCash(1000, anchor, events, d("2026-04-30T00:00:00Z")).balance).toBe(6000);
  });

  it("ignores events after asOf (not yet happened)", () => {
    const events: CashEvent[] = [
      { kind: "income", on: d("2026-04-01T12:00:00Z"), amount: 5000 },
      { kind: "income", on: d("2026-05-01T12:00:00Z"), amount: 5000 },
      { kind: "billPayment", on: d("2026-04-20T00:00:00Z"), amount: 1000 },
    ];
    expect(sumCash(0, anchor, events, d("2026-04-15T00:00:00Z")).balance).toBe(5000);
  });

  it("a reversal (negative payment) nets the bill back out", () => {
    const events: CashEvent[] = [
      { kind: "billPayment", on: d("2026-04-05T00:00:00Z"), amount: 2000 },
      { kind: "billPayment", on: d("2026-04-20T00:00:00Z"), amount: -2000 },
    ];
    expect(sumCash(0, anchor, events, d("2026-04-30T00:00:00Z")).billsPaid).toBe(0);
  });

  it("a refund one-off (negative) adds cash back", () => {
    const events: CashEvent[] = [
      { kind: "oneOff", on: d("2026-04-05T00:00:00Z"), amount: 1000 },
      { kind: "oneOff", on: d("2026-04-06T00:00:00Z"), amount: -400 },
    ];
    expect(sumCash(0, anchor, events, d("2026-04-30T00:00:00Z")).oneOffSpend).toBe(600);
  });
});

type Adhoc = { type: string; amount: number; date: Date; notes: string | null; ccTemplateId: string | null; isCredit: boolean; isCardRepayment: boolean };

describe("incomeEventsFor", () => {
  const month = (m: number, y: number, salaryIncome: number, adHocItems: Adhoc[] = []) =>
    ({ month: m, year: y, salaryIncome, adHocItems });

  it("no income templates: one event per month at payDay", () => {
    const events = incomeEventsFor([month(4, 2026, 200000), month(5, 2026, 210000)], [], 25);
    expect(events).toHaveLength(2);
    expect(events[0].on.toISOString()).toBe("2026-04-25T12:00:00.000Z");
    expect(events[0].amount).toBe(200000);
    expect(events[1].on.toISOString()).toBe("2026-05-25T12:00:00.000Z");
  });

  it("payDay past the end of the month clamps to the last day", () => {
    const events = incomeEventsFor([month(2, 2026, 100000)], [], 31);
    expect(events[0].on.toISOString()).toBe("2026-02-28T12:00:00.000Z");
  });

  it("ad-hoc income is dated by its own date; overrides replace a template", () => {
    const templates = [{ id: "t1", amount: 200000, dueDateDay: 1, pendingAmount: null, pendingFromMonth: null, pendingFromYear: null }];
    const events = incomeEventsFor([
      month(4, 2026, 0, [
        { type: "INCOME", amount: 50000, date: new Date("2026-04-18T00:00:00Z"), notes: null, ccTemplateId: null, isCredit: false, isCardRepayment: false },
        { type: "INCOME", amount: 180000, date: new Date("2026-04-01T00:00:00Z"), notes: "income_override:t1", ccTemplateId: null, isCredit: false, isCardRepayment: false },
      ]),
    ], templates, 1);
    const total = events.reduce((s, e) => s + e.amount, 0);
    expect(total).toBe(230000); // 50k adhoc + 180k override (not the template's 200k)
  });

  it("a pending template amount kicks in from its effective month", () => {
    const templates = [{ id: "t1", amount: 100000, dueDateDay: 1, pendingAmount: 120000, pendingFromMonth: 5, pendingFromYear: 2026 }];
    const events = incomeEventsFor([month(4, 2026, 0), month(5, 2026, 0)], templates, 1);
    expect(events[0].amount).toBe(100000); // April: still old amount
    expect(events[1].amount).toBe(120000); // May: pending amount promoted
  });
});

describe("oneOffEventsFor", () => {
  const item = (o: Partial<Adhoc>): Adhoc => ({ type: "EXPENSE", amount: 1000, date: new Date("2026-04-10T00:00:00Z"), notes: null, ccTemplateId: null, isCredit: false, isCardRepayment: false, ...o });

  it("plain cash spend counts; a card charge does not", () => {
    const events = oneOffEventsFor([{ month: 4, year: 2026, salaryIncome: 0, adHocItems: [
      item({}),
      item({ ccTemplateId: "card1" }),
    ] }]);
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(1000);
  });

  it("a card repayment is a cash outflow; a cash refund is negative", () => {
    const events = oneOffEventsFor([{ month: 4, year: 2026, salaryIncome: 0, adHocItems: [
      item({ ccTemplateId: "card1", isCardRepayment: true, isCredit: true, amount: 5000 }),
      item({ isCredit: true, amount: 300 }),
    ] }]);
    const total = events.reduce((s, e) => s + e.amount, 0);
    expect(total).toBe(4700); // +5000 repayment, −300 refund
  });
});
