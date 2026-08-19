import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  applyCCEffect,
  reverseCCEffect,
  settleCarriedDebtBackward,
  applyBillPaymentToCard,
  reverseBillPaymentFromCard,
} from "./cc-effects";

// A hand-rolled fake matching only the exact Prisma calls cc-effects.ts
// makes (see each model's methods below) — not a general query engine.
// Lets these tests exercise the real self-healing recompute logic (the
// part that's actually had bugs: baseline drift, opening-balance freezing,
// utilization/cashback netting) without a real Postgres instance.
type FakeMonthlyEntry = {
  id: string; monthId: string; templateId: string;
  amount: number; billedAmount: number | null; statementAmount: number | null;
  openingAmount: number; carriedInAmount: number | null; cashbackAmount: number | null;
  isPaid: boolean; paidOn: Date | null; paidAmount: number | null; billPaymentsAttributed: number;
};
type FakeAdHocItem = { id: string; monthId: string; type: string; ccTemplateId: string | null; amount: number; date: Date; isCredit: boolean };
type FakeTemplate = { id: string; userId: string; category: string; statementDay: number | null };
type FakeMonth = { id: string; userId: string; month: number; year: number };
type FakeSettlement = { id: string; userId: string; templateId: string; billMonth: number; billYear: number; amount: number };

type Select = Record<string, boolean> | undefined;
type Row = Record<string, unknown>;

function project(obj: Row, select: Select): Row {
  if (!select) return obj;
  const out: Row = {};
  for (const key in select) {
    if (select[key]) out[key] = obj[key];
  }
  return out;
}

// Applies a Prisma `data` object's plain assignments AND `{ increment }` /
// `{ decrement }` operators onto a row in place — both are used across the
// module's update/upsert calls.
function applyOps(row: Row, data: Row) {
  for (const key in data) {
    const v = data[key];
    if (v && typeof v === "object" && "increment" in v) row[key] = ((row[key] as number) ?? 0) + (v as { increment: number }).increment;
    else if (v && typeof v === "object" && "decrement" in v) row[key] = ((row[key] as number) ?? 0) - (v as { decrement: number }).decrement;
    else row[key] = v;
  }
}

interface AdHocFindManyArgs { where: { monthId: string; type: string; ccTemplateId: string | null }; select?: Select }
interface EntryFindUniqueArgs { where: { monthId_templateId?: { monthId: string; templateId: string }; id?: string } }
interface EntryFindUniqueOrThrowArgs { where: { id: string }; select?: Select }
interface EntryFindFirstArgs {
  where: {
    id?: string; templateId?: string; monthId?: string; isPaid?: boolean;
    month?: { userId?: string; month?: number; year?: number };
    template?: { id?: string; category?: string; userId?: string };
  };
  select?: Select & { template?: { select: Select } };
}
interface EntryCreateArgs { data: Partial<FakeMonthlyEntry> & { monthId: string; templateId: string } }
interface EntryUpdateArgs { where: { id: string }; data: Row; select?: Select }
interface EntryUpsertArgs {
  where: { monthId_templateId: { monthId: string; templateId: string } };
  create: Partial<FakeMonthlyEntry>;
  update: Row;
  select?: Select;
}
interface TemplateFindFirstArgs { where: { id?: string; userId?: string; category?: string } }
interface MonthFindFirstArgs { where: { userId?: string; month?: number; year?: number } }
interface SettlementCreateArgs { data: Omit<FakeSettlement, "id"> }

function makeFakeDb() {
  let n = 0;
  const newId = () => `id${++n}`;

  const adHocItems: FakeAdHocItem[] = [];
  const monthlyEntries: FakeMonthlyEntry[] = [];
  const templates: FakeTemplate[] = [];
  const months: FakeMonth[] = [];
  const settlements: FakeSettlement[] = [];

  const fakeDb = {
    adHocItem: {
      findMany: async ({ where, select }: AdHocFindManyArgs) => adHocItems
        .filter(i => i.monthId === where.monthId && i.type === where.type && i.ccTemplateId === where.ccTemplateId)
        .map(i => project(i, select)),
    },
    monthlyEntry: {
      findUnique: async ({ where }: EntryFindUniqueArgs) => {
        if (where.monthId_templateId) {
          const { monthId, templateId } = where.monthId_templateId;
          return monthlyEntries.find(e => e.monthId === monthId && e.templateId === templateId) ?? null;
        }
        return monthlyEntries.find(e => e.id === where.id) ?? null;
      },
      findUniqueOrThrow: async ({ where, select }: EntryFindUniqueOrThrowArgs) => {
        const row = monthlyEntries.find(e => e.id === where.id);
        if (!row) throw new Error(`MonthlyEntry ${where.id} not found`);
        return project(row, select);
      },
      findFirst: async ({ where, select }: EntryFindFirstArgs) => {
        const row = monthlyEntries.find(e => {
          if (where.id !== undefined && e.id !== where.id) return false;
          if (where.templateId !== undefined && e.templateId !== where.templateId) return false;
          if (where.monthId !== undefined && e.monthId !== where.monthId) return false;
          if (where.isPaid !== undefined && e.isPaid !== where.isPaid) return false;
          if (where.month) {
            const m = months.find(mm => mm.id === e.monthId);
            if (!m) return false;
            if (where.month.userId !== undefined && m.userId !== where.month.userId) return false;
            if (where.month.month !== undefined && m.month !== where.month.month) return false;
            if (where.month.year !== undefined && m.year !== where.month.year) return false;
          }
          if (where.template) {
            const t = templates.find(tt => tt.id === e.templateId);
            if (!t) return false;
            if (where.template.id !== undefined && t.id !== where.template.id) return false;
            if (where.template.category !== undefined && t.category !== where.template.category) return false;
            if (where.template.userId !== undefined && t.userId !== where.template.userId) return false;
          }
          return true;
        });
        if (!row) return null;
        const out = project(row, select);
        if (select?.template) {
          const t = templates.find(tt => tt.id === row.templateId);
          out.template = project((t ?? {}) as Row, select.template.select);
        }
        return out;
      },
      create: async ({ data }: EntryCreateArgs) => {
        const row: FakeMonthlyEntry = {
          id: newId(), monthId: data.monthId, templateId: data.templateId,
          amount: data.amount ?? 0, billedAmount: data.billedAmount ?? null,
          statementAmount: data.statementAmount ?? null,
          openingAmount: data.openingAmount ?? 0,
          carriedInAmount: data.carriedInAmount ?? null,
          cashbackAmount: data.cashbackAmount ?? null,
          isPaid: data.isPaid ?? false, paidOn: data.paidOn ?? null,
          paidAmount: data.paidAmount ?? null,
          billPaymentsAttributed: data.billPaymentsAttributed ?? 0,
        };
        monthlyEntries.push(row);
        return row;
      },
      update: async ({ where, data, select }: EntryUpdateArgs) => {
        const row = monthlyEntries.find(e => e.id === where.id);
        if (!row) throw new Error(`MonthlyEntry ${where.id} not found`);
        applyOps(row as unknown as Row, data);
        return project(row as unknown as Row, select);
      },
      upsert: async ({ where, create, update, select }: EntryUpsertArgs) => {
        const { monthId, templateId } = where.monthId_templateId;
        let row = monthlyEntries.find(e => e.monthId === monthId && e.templateId === templateId);
        if (!row) {
          row = {
            id: newId(), monthId, templateId,
            amount: create.amount ?? 0, billedAmount: create.billedAmount ?? null,
            statementAmount: create.statementAmount ?? null,
            openingAmount: create.openingAmount ?? 0,
            carriedInAmount: create.carriedInAmount ?? null,
            cashbackAmount: create.cashbackAmount ?? null,
            isPaid: create.isPaid ?? false, paidOn: create.paidOn ?? null,
            paidAmount: create.paidAmount ?? null,
            billPaymentsAttributed: create.billPaymentsAttributed ?? 0,
          };
          monthlyEntries.push(row);
        } else {
          applyOps(row as unknown as Row, update);
        }
        return project(row as unknown as Row, select);
      },
    },
    lineItemTemplate: {
      findFirst: async ({ where }: TemplateFindFirstArgs) => templates.find(t =>
        (where.id === undefined || t.id === where.id) &&
        (where.userId === undefined || t.userId === where.userId) &&
        (where.category === undefined || t.category === where.category)
      ) ?? null,
    },
    month: {
      findFirst: async ({ where }: MonthFindFirstArgs) => months.find(m =>
        (where.userId === undefined || m.userId === where.userId) &&
        (where.month === undefined || m.month === where.month) &&
        (where.year === undefined || m.year === where.year)
      ) ?? null,
    },
    carriedDebtSettlement: {
      create: async ({ data }: SettlementCreateArgs) => {
        const row: FakeSettlement = { id: newId(), ...data };
        settlements.push(row);
        return row;
      },
    },
  };

  return { db: fakeDb as unknown as Parameters<typeof applyCCEffect>[0], adHocItems, monthlyEntries, templates, months, settlements };
}

const USER = "user1";

describe("applyCCEffect", () => {
  it("returns null for an unknown or wrong-category template", async () => {
    const { db } = makeFakeDb();
    const result = await applyCCEffect(db, USER, "m1", "missing-template", new Date(2026, 2, 10), 100);
    expect(result).toBeNull();
  });

  it("creates a new entry on the first pre-close charge and sums it into amount/billedAmount", async () => {
    const { db, templates, adHocItems } = makeFakeDb();
    templates.push({ id: "card1", userId: USER, category: "CREDIT_CARD", statementDay: 20 });
    // applyCCEffect resums live from AdHocItem rows — it never trusts the
    // `amount` param — so the caller's charge row has to already exist.
    adHocItems.push({ id: "a1", monthId: "m1", type: "EXPENSE", ccTemplateId: "card1", amount: 500, date: new Date(2026, 2, 5), isCredit: false });

    const result = await applyCCEffect(db, USER, "m1", "card1", new Date(2026, 2, 5), 500);

    expect(result).not.toBeNull();
    expect(result!.amount).toBe(500);
    expect(result!.billedAmount).toBe(500);
  });

  it("routes a post-close charge into statementAmount, leaving amount untouched", async () => {
    const { db, templates, monthlyEntries, adHocItems } = makeFakeDb();
    templates.push({ id: "card1", userId: USER, category: "CREDIT_CARD", statementDay: 10 });
    monthlyEntries.push({
      id: "e1", monthId: "m1", templateId: "card1", amount: 1000, billedAmount: 1000,
      statementAmount: 0, openingAmount: 1000, carriedInAmount: 0, cashbackAmount: null,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 0,
    });
    adHocItems.push({ id: "a1", monthId: "m1", type: "EXPENSE", ccTemplateId: "card1", amount: 300, date: new Date(2026, 2, 15), isCredit: false });

    const result = await applyCCEffect(db, USER, "m1", "card1", new Date(2026, 2, 15), 300);

    expect(result!.amount).toBe(1000); // untouched
    expect(result!.statementAmount).toBe(300);
  });

  it("nets isCredit rows out of the total instead of adding them", async () => {
    const { db, templates, adHocItems } = makeFakeDb();
    templates.push({ id: "card1", userId: USER, category: "CREDIT_CARD", statementDay: 20 });
    adHocItems.push(
      { id: "a1", monthId: "m1", type: "EXPENSE", ccTemplateId: "card1", amount: 500, date: new Date(2026, 2, 3), isCredit: false },
      { id: "a2", monthId: "m1", type: "EXPENSE", ccTemplateId: "card1", amount: 200, date: new Date(2026, 2, 5), isCredit: true },
    );

    const result = await applyCCEffect(db, USER, "m1", "card1", new Date(2026, 2, 5), 200);

    expect(result!.amount).toBe(300); // 500 - 200, opening balance 0
  });

  it("folds billPaymentsAttributed into the pre-close amount", async () => {
    const { db, templates, monthlyEntries, adHocItems } = makeFakeDb();
    templates.push({ id: "card1", userId: USER, category: "CREDIT_CARD", statementDay: 20 });
    monthlyEntries.push({
      id: "e1", monthId: "m1", templateId: "card1", amount: 0, billedAmount: 0,
      statementAmount: 0, openingAmount: 0, carriedInAmount: 0, cashbackAmount: null,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 400,
    });
    adHocItems.push({ id: "a1", monthId: "m1", type: "EXPENSE", ccTemplateId: "card1", amount: 100, date: new Date(2026, 2, 5), isCredit: false });

    const result = await applyCCEffect(db, USER, "m1", "card1", new Date(2026, 2, 5), 100);

    expect(result!.amount).toBe(500); // 0 (opening) + 100 (new charge) + 400 (billPaymentsAttributed)
  });

  it("self-heals to isPaid once cashback fully covers the recomputed balance", async () => {
    const { db, templates, monthlyEntries, adHocItems } = makeFakeDb();
    templates.push({ id: "card1", userId: USER, category: "CREDIT_CARD", statementDay: 20 });
    monthlyEntries.push({
      id: "e1", monthId: "m1", templateId: "card1", amount: 1000, billedAmount: 1000,
      statementAmount: 0, openingAmount: 1000, carriedInAmount: 0, cashbackAmount: 1000,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 0,
    });
    // A refund/credit row that fully cancels out the original 1000 spend —
    // recomputed amount lands at 0, and with cashback already covering the
    // (now smaller) balance, this should auto-close as paid.
    adHocItems.push({ id: "a1", monthId: "m1", type: "EXPENSE", ccTemplateId: "card1", amount: 1000, date: new Date(2026, 2, 3), isCredit: true });

    const result = await applyCCEffect(db, USER, "m1", "card1", new Date(2026, 2, 5), 0);

    expect(result!.amount).toBe(0);
    expect(monthlyEntries[0].isPaid).toBe(true);
  });

  it("does not self-heal to paid while carriedInAmount is still owed", async () => {
    const { db, templates, monthlyEntries } = makeFakeDb();
    templates.push({ id: "card1", userId: USER, category: "CREDIT_CARD", statementDay: 20 });
    monthlyEntries.push({
      id: "e1", monthId: "m1", templateId: "card1", amount: 0, billedAmount: 0,
      statementAmount: 0, openingAmount: 0, carriedInAmount: 500, cashbackAmount: null,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 0,
    });

    await applyCCEffect(db, USER, "m1", "card1", new Date(2026, 2, 5), 0);

    expect(monthlyEntries[0].isPaid).toBe(false);
  });
});

describe("reverseCCEffect", () => {
  it("returns null when no entry exists for the card in this month", async () => {
    const { db } = makeFakeDb();
    const result = await reverseCCEffect(db, USER, "m1", "card1", new Date(2026, 2, 5), 100);
    expect(result).toBeNull();
  });

  it("recomputes amount down after the underlying adhoc row has already been removed", async () => {
    const { db, templates, monthlyEntries, adHocItems } = makeFakeDb();
    templates.push({ id: "card1", userId: USER, category: "CREDIT_CARD", statementDay: 20 });
    monthlyEntries.push({
      id: "e1", monthId: "m1", templateId: "card1", amount: 800, billedAmount: 800,
      statementAmount: 0, openingAmount: 0, carriedInAmount: 0, cashbackAmount: null,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 0,
    });
    // Only the surviving charge remains — the reversed one was already deleted by the caller.
    adHocItems.push({ id: "a2", monthId: "m1", type: "EXPENSE", ccTemplateId: "card1", amount: 300, date: new Date(2026, 2, 3), isCredit: false });

    const result = await reverseCCEffect(db, USER, "m1", "card1", new Date(2026, 2, 5), 500);

    expect(result!.amount).toBe(300);
  });

  it("recomputes statementAmount for a post-close reversal", async () => {
    const { db, templates, monthlyEntries, adHocItems } = makeFakeDb();
    templates.push({ id: "card1", userId: USER, category: "CREDIT_CARD", statementDay: 10 });
    monthlyEntries.push({
      id: "e1", monthId: "m1", templateId: "card1", amount: 100, billedAmount: 100,
      statementAmount: 900, openingAmount: 100, carriedInAmount: 0, cashbackAmount: null,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 0,
    });
    adHocItems.push({ id: "a2", monthId: "m1", type: "EXPENSE", ccTemplateId: "card1", amount: 400, date: new Date(2026, 2, 15), isCredit: false });

    const result = await reverseCCEffect(db, USER, "m1", "card1", new Date(2026, 2, 20), 500);

    expect(result!.statementAmount).toBe(400);
    expect(result!.amount).toBe(100); // untouched
  });
});

describe("settleCarriedDebtBackward", () => {
  it("fully settles a single prior month's bill and logs the settlement", async () => {
    const { db, monthlyEntries, months, settlements } = makeFakeDb();
    months.push({ id: "prevM", userId: USER, month: 2, year: 2026 });
    monthlyEntries.push({
      id: "prevE", monthId: "prevM", templateId: "card1", amount: 1000, billedAmount: 1000,
      statementAmount: null, openingAmount: 1000, carriedInAmount: 0, cashbackAmount: null,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 0,
    });

    await settleCarriedDebtBackward(db, USER, "card1", 3, 2026, 1000);

    expect(monthlyEntries[0].isPaid).toBe(true);
    expect(monthlyEntries[0].paidAmount).toBeNull(); // exact settle clears back to "fall back to amount"
    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toMatchObject({ templateId: "card1", billMonth: 2, billYear: 2026, amount: 1000 });
  });

  it("applies a partial payment without marking the bill paid", async () => {
    const { db, monthlyEntries, months, settlements } = makeFakeDb();
    months.push({ id: "prevM", userId: USER, month: 2, year: 2026 });
    monthlyEntries.push({
      id: "prevE", monthId: "prevM", templateId: "card1", amount: 1000, billedAmount: 1000,
      statementAmount: null, openingAmount: 1000, carriedInAmount: 0, cashbackAmount: null,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 0,
    });

    await settleCarriedDebtBackward(db, USER, "card1", 3, 2026, 400);

    expect(monthlyEntries[0].isPaid).toBe(false);
    expect(monthlyEntries[0].paidAmount).toBe(400);
    expect(settlements[0].amount).toBe(400);
  });

  it("respects cashback when computing what's actually still owed", async () => {
    const { db, monthlyEntries, months } = makeFakeDb();
    months.push({ id: "prevM", userId: USER, month: 2, year: 2026 });
    monthlyEntries.push({
      id: "prevE", monthId: "prevM", templateId: "card1", amount: 1000, billedAmount: 1000,
      statementAmount: null, openingAmount: 1000, carriedInAmount: 0, cashbackAmount: 300,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 0,
    });

    // Net obligation is 700 (1000 - 300 cashback) — paying exactly 700 should fully settle it.
    await settleCarriedDebtBackward(db, USER, "card1", 3, 2026, 700);

    expect(monthlyEntries[0].isPaid).toBe(true);
  });

  it("walks back multiple months while carriedInAmount keeps chaining", async () => {
    const { db, monthlyEntries, months, settlements } = makeFakeDb();
    // Feb's bill (500) is itself carried debt from Jan (carriedInAmount > 0),
    // so fully settling Feb should keep walking back to settle Jan too.
    months.push({ id: "janM", userId: USER, month: 1, year: 2026 });
    months.push({ id: "febM", userId: USER, month: 2, year: 2026 });
    monthlyEntries.push({
      id: "janE", monthId: "janM", templateId: "card1", amount: 300, billedAmount: 300,
      statementAmount: null, openingAmount: 300, carriedInAmount: 0, cashbackAmount: null,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 0,
    });
    monthlyEntries.push({
      id: "febE", monthId: "febM", templateId: "card1", amount: 500, billedAmount: 500,
      statementAmount: null, openingAmount: 500, carriedInAmount: 300, cashbackAmount: null,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 0,
    });

    await settleCarriedDebtBackward(db, USER, "card1", 3, 2026, 800);

    const jan = monthlyEntries.find(e => e.id === "janE")!;
    const feb = monthlyEntries.find(e => e.id === "febE")!;
    expect(feb.isPaid).toBe(true);
    expect(jan.isPaid).toBe(true);
    expect(settlements).toHaveLength(2);
    expect(settlements.find(s => s.billMonth === 2)?.amount).toBe(500);
    expect(settlements.find(s => s.billMonth === 1)?.amount).toBe(300);
  });

  it("stops walking back once a fully-settled month had no carried debt of its own", async () => {
    const { db, monthlyEntries, months, settlements } = makeFakeDb();
    // Feb's bill (500) is NOT itself carried debt (carriedInAmount 0) — even
    // with money left over, there's nothing further back to attribute it to.
    months.push({ id: "janM", userId: USER, month: 1, year: 2026 });
    months.push({ id: "febM", userId: USER, month: 2, year: 2026 });
    monthlyEntries.push({
      id: "janE", monthId: "janM", templateId: "card1", amount: 300, billedAmount: 300,
      statementAmount: null, openingAmount: 300, carriedInAmount: 0, cashbackAmount: null,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 0,
    });
    monthlyEntries.push({
      id: "febE", monthId: "febM", templateId: "card1", amount: 500, billedAmount: 500,
      statementAmount: null, openingAmount: 500, carriedInAmount: 0, cashbackAmount: null,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 0,
    });

    await settleCarriedDebtBackward(db, USER, "card1", 3, 2026, 800);

    const jan = monthlyEntries.find(e => e.id === "janE")!;
    const feb = monthlyEntries.find(e => e.id === "febE")!;
    expect(feb.isPaid).toBe(true);
    expect(jan.isPaid).toBe(false); // never touched — walk-back stopped after Feb
    expect(settlements).toHaveLength(1);
  });

  it("does nothing when there's no prior unpaid bill at all", async () => {
    const { db, settlements } = makeFakeDb();
    await settleCarriedDebtBackward(db, USER, "card1", 3, 2026, 500);
    expect(settlements).toHaveLength(0);
  });
});

describe("applyBillPaymentToCard / reverseBillPaymentFromCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15)); // 15th
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a brand-new entry attributing the payment when the card has no entry yet this month (pre-close)", async () => {
    const { db, templates, months, monthlyEntries } = makeFakeDb();
    templates.push({ id: "card1", userId: USER, category: "CREDIT_CARD", statementDay: 20 }); // 20 > 15 => pre-close
    months.push({ id: "m1", userId: USER, month: 3, year: 2026 });

    await applyBillPaymentToCard(db, USER, "card1", 250);

    expect(monthlyEntries).toHaveLength(1);
    expect(monthlyEntries[0].billPaymentsAttributed).toBe(250);
    expect(monthlyEntries[0].amount).toBe(250); // opening 0 + billPaymentsAttributed 250
  });

  it("increments billPaymentsAttributed on an existing entry and re-derives amount (post-close)", async () => {
    const { db, templates, months, monthlyEntries } = makeFakeDb();
    templates.push({ id: "card1", userId: USER, category: "CREDIT_CARD", statementDay: 10 }); // 10 <= 15 => post-close
    months.push({ id: "m1", userId: USER, month: 3, year: 2026 });
    monthlyEntries.push({
      id: "e1", monthId: "m1", templateId: "card1", amount: 500, billedAmount: 500,
      statementAmount: 0, openingAmount: 500, carriedInAmount: 0, cashbackAmount: null,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 0,
    });

    await applyBillPaymentToCard(db, USER, "card1", 100);

    expect(monthlyEntries[0].billPaymentsAttributed).toBe(100);
    expect(monthlyEntries[0].statementAmount).toBe(0); // no adhoc items post-close; amount untouched
    expect(monthlyEntries[0].amount).toBe(500);
  });

  it("does nothing when there's no month row yet for today", async () => {
    const { db, monthlyEntries } = makeFakeDb();
    await applyBillPaymentToCard(db, USER, "card1", 100);
    expect(monthlyEntries).toHaveLength(0);
  });

  it("reverseBillPaymentFromCard decrements attribution and recomputes", async () => {
    const { db, templates, months, monthlyEntries } = makeFakeDb();
    templates.push({ id: "card1", userId: USER, category: "CREDIT_CARD", statementDay: 20 }); // pre-close
    months.push({ id: "m1", userId: USER, month: 3, year: 2026 });
    monthlyEntries.push({
      id: "e1", monthId: "m1", templateId: "card1", amount: 250, billedAmount: 250,
      statementAmount: 0, openingAmount: 0, carriedInAmount: 0, cashbackAmount: null,
      isPaid: false, paidOn: null, paidAmount: null, billPaymentsAttributed: 250,
    });

    await reverseBillPaymentFromCard(db, USER, "card1", 250);

    expect(monthlyEntries[0].billPaymentsAttributed).toBe(0);
    expect(monthlyEntries[0].amount).toBe(0);
  });

  it("reverseBillPaymentFromCard is a no-op when the card has no entry this month", async () => {
    const { db, templates, months } = makeFakeDb();
    templates.push({ id: "card1", userId: USER, category: "CREDIT_CARD", statementDay: 20 });
    months.push({ id: "m1", userId: USER, month: 3, year: 2026 });
    // Should resolve without throwing.
    await expect(reverseBillPaymentFromCard(db, USER, "card1", 100)).resolves.toBeUndefined();
  });
});
