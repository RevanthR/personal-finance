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

  it("a statement already paid off doesn't show as owed just because a due-date change moved it into this month", () => {
    // Changing a card's payment day can retroactively attribute an
    // already-settled statement to a future month (see cardBillForMonth /
    // statementDueInMonth) — it must not read as a fresh unpaid bill there.
    const bills: MonthlyCardBills = {
      total: 19974, paid: 19974, cashback: 0, unbilled: 0,
      byCard: [{ templateId: "indus", name: "Indus Ind", amount: 19974, paid: 19974, cashback: 0, unbilled: 0, basis: "confirmed" }],
    };
    expect(projectedCardTotal(bills)).toEqual({ total: 0, byCard: [] });
  });

  it("nets a partial payment and cashback, then adds the next cycle's running spend", () => {
    const bills: MonthlyCardBills = {
      total: 40151, paid: 20000, cashback: 1804, unbilled: 0,
      byCard: [{ templateId: "indus", name: "Indus Ind", amount: 40151, paid: 20000, cashback: 1804, unbilled: 5000, basis: "confirmed" }],
    };
    const r = projectedCardTotal(bills);
    // 40151 - 20000 - 1804 = 18347, plus 5000 unbilled
    expect(r.total).toBe(23347);
    expect(r.byCard).toEqual([{ templateId: "indus", name: "Indus Ind", amount: 23347 }]);
  });
});
