import { describe, it, expect } from "vitest";
import { projectMonth, type ProjectionTemplate } from "./projection";

function tpl(o: Partial<ProjectionTemplate> = {}): ProjectionTemplate {
  return {
    id: o.id ?? "t1",
    name: o.name ?? "Item",
    templateType: o.templateType ?? "EXPENSE",
    category: o.category ?? "PERSONAL",
    customCategory: o.customCategory ?? null,
    amount: o.amount ?? 1000,
    isFixed: o.isFixed ?? false,
    frequency: o.frequency ?? "MONTHLY",
    dueMonth: o.dueMonth ?? null,
    dueDateDay: o.dueDateDay ?? null,
    pendingAmount: o.pendingAmount ?? null,
    pendingFromMonth: o.pendingFromMonth ?? null,
    pendingFromYear: o.pendingFromYear ?? null,
    endsOnMonth: o.endsOnMonth ?? null,
    endsOnYear: o.endsOnYear ?? null,
    loanInterestRate: o.loanInterestRate ?? null,
    loanOriginalPrincipal: o.loanOriginalPrincipal ?? null,
    loanStartDate: o.loanStartDate ?? null,
    loanOutstandingOverride: o.loanOutstandingOverride ?? null,
    chitFund: o.chitFund,
  };
}
const noCC = { total: 0, byCard: [] };

describe("projectMonth", () => {
  it("sums active monthly expense templates and income templates", () => {
    const r = projectMonth({
      month: 10, year: 2026,
      templates: [
        tpl({ id: "rent", name: "Rent", amount: 30000 }),
        tpl({ id: "sal", name: "Salary", templateType: "INCOME", category: "SALARY", amount: 200000 }),
      ],
      ccBills: noCC,
    });
    expect(r.income).toBe(200000);
    expect(r.expenses).toBe(30000);
    expect(r.expenseItems).toHaveLength(1);
    expect(r.incomeSources).toEqual([{ name: "Salary", amount: 200000, kind: "template" }]);
  });

  it("applies a pending amount change that has reached its effective month", () => {
    const r = projectMonth({
      month: 12, year: 2026,
      templates: [tpl({ id: "rent", name: "Rent", amount: 30000, pendingAmount: 34000, pendingFromMonth: 12, pendingFromYear: 2026 })],
      ccBills: noCC,
    });
    expect(r.expenses).toBe(34000);
  });

  it("falls back to last month's salary when there are no income templates", () => {
    const r = projectMonth({ month: 10, year: 2026, templates: [tpl()], ccBills: noCC, fallbackIncome: 150000 });
    expect(r.income).toBe(150000);
  });

  it("folds in receivables due that month and ad-hoc income already on the month", () => {
    const r = projectMonth({
      month: 10, year: 2026,
      templates: [tpl({ templateType: "INCOME", category: "SALARY", amount: 100000 })],
      ccBills: noCC,
      receivables: [
        { description: "Bonus", expectedAmount: 25000, expectedDate: "2026-10-15" },
        { description: "Next FY", expectedAmount: 9999, expectedDate: "2026-11-15" },
      ],
      existingAdHoc: [{ name: "Gift", amount: 5000, type: "INCOME" }],
    });
    expect(r.income).toBe(130000);
    expect(r.incomeSources.map(s => s.kind)).toEqual(["template", "receivable", "adhoc"]);
  });

  it("takes CC bills from the shared per-month formula, not templates", () => {
    const r = projectMonth({
      month: 10, year: 2026,
      templates: [tpl({ id: "axis", name: "Axis", category: "CREDIT_CARD", amount: 999 })],
      ccBills: { total: 63000, byCard: [{ templateId: "axis", name: "Axis", amount: 63000, basis: "projected" }] },
    });
    expect(r.ccTotal).toBe(63000);
    expect(r.expenses).toBe(63000); // the 999 template amount is ignored
    expect(r.expenseItems.find(e => e.category === "CREDIT_CARD")?.amount).toBe(63000);
  });

  it("flags a monthly template that stops this month", () => {
    const r = projectMonth({
      month: 11, year: 2026,
      templates: [tpl({ id: "gym", name: "Gym", amount: 2000, endsOnMonth: 10, endsOnYear: 2026 })],
      ccBills: noCC,
    });
    expect(r.expenseItems).toHaveLength(0);
    expect(r.endingTemplateNames).toEqual(["Gym"]);
  });
});
