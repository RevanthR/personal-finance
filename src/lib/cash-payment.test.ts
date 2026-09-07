import { describe, it, expect } from "vitest";
import { recordEntryCashDelta, recordCardCashDelta } from "./cash-payment";

// Minimal fake transaction client that just captures cashPayment.create calls.
function fakeTx() {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    cashPayment: { create: async ({ data }: { data: Record<string, unknown> }) => { rows.push(data); return data; } },
  };
}

const entry = (o: Partial<{ amount: number; cashbackAmount: number | null; isPaid: boolean; paidAmount: number | null; paidViaCardTemplateId: string | null }> = {}) =>
  ({ amount: 1000, cashbackAmount: null, isPaid: false, paidAmount: null, paidViaCardTemplateId: null, ...o });

describe("recordEntryCashDelta", () => {
  it("unpaid -> paid: one positive row for the net amount", async () => {
    const tx = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordEntryCashDelta(tx as any, "u1", "e1", entry(), entry({ isPaid: true }));
    expect(tx.rows).toHaveLength(1);
    expect(tx.rows[0]).toMatchObject({ userId: "u1", monthlyEntryId: "e1", amount: 1000 });
  });

  it("paid -> unpaid: one negative reversal row", async () => {
    const tx = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordEntryCashDelta(tx as any, "u1", "e1", entry({ isPaid: true }), entry());
    expect(tx.rows[0]).toMatchObject({ amount: -1000, note: "reversal" });
  });

  it("partial then rest: each records its own delta", async () => {
    const tx = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordEntryCashDelta(tx as any, "u1", "e1", entry(), entry({ paidAmount: 400 }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordEntryCashDelta(tx as any, "u1", "e1", entry({ paidAmount: 400 }), entry({ isPaid: true, paidAmount: 1000 }));
    expect(tx.rows.map(r => r.amount)).toEqual([400, 600]);
  });

  it("paid via card contributes no cash", async () => {
    const tx = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordEntryCashDelta(tx as any, "u1", "e1", entry(), entry({ isPaid: true, paidViaCardTemplateId: "card1" }));
    expect(tx.rows).toHaveLength(0);
  });

  it("cashback reduces the cash outflow", async () => {
    const tx = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordEntryCashDelta(tx as any, "u1", "e1", entry({ cashbackAmount: 100 }), entry({ cashbackAmount: 100, isPaid: true }));
    expect(tx.rows[0].amount).toBe(900);
  });
});

describe("recordCardCashDelta", () => {
  it("records the change in paidAmount", async () => {
    const tx = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordCardCashDelta(tx as any, "u1", "s1", 0, 5000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordCardCashDelta(tx as any, "u1", "s1", 5000, 0);
    expect(tx.rows.map(r => r.amount)).toEqual([5000, -5000]);
    expect(tx.rows[1]).toMatchObject({ cardStatementId: "s1", note: "reversal" });
  });
});
