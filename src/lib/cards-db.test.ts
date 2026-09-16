import { describe, it, expect } from "vitest";
import { projectedCardTotal, type MonthlyCardBills } from "./cards-db";

describe("projectedCardTotal", () => {
  it("folds an unclosed cycle's running spend into the bill for a forward estimate", () => {
    const bills: MonthlyCardBills = {
      total: 66943, paid: 0, cashback: 0, unbilled: 19745,
      byCard: [
        { templateId: "axis", name: "Axis CC", amount: 66943, paid: 0, cashback: 0, unbilled: 0, basis: "confirmed" },
        { templateId: "indus", name: "Indus Ind", amount: 0, paid: 0, cashback: 0, unbilled: 19745, basis: "open" },
      ],
    };
    const r = projectedCardTotal(bills);
    expect(r.total).toBe(86688);
    expect(r.byCard).toEqual([
      { templateId: "axis", name: "Axis CC", amount: 66943 },
      { templateId: "indus", name: "Indus Ind", amount: 19745 },
    ]);
  });

  it("drops a card with nothing billed and nothing unbilled", () => {
    const bills: MonthlyCardBills = {
      total: 0, paid: 0, cashback: 0, unbilled: 0,
      byCard: [{ templateId: "amazon", name: "Amazon Pay CC", amount: 0, paid: 0, cashback: 0, unbilled: 0, basis: "open" }],
    };
    expect(projectedCardTotal(bills)).toEqual({ total: 0, byCard: [] });
  });
});
