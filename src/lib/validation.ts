import { z } from "zod";
import { NextResponse } from "next/server";

// ── Primitives ────────────────────────────────────────────────────────────────
export const zMoney   = z.number().finite().min(0).max(100_000_000);
export const zDay     = z.number().int().min(1).max(31);
export const zMonth   = z.number().int().min(1).max(12);
export const zYear    = z.number().int().min(2000).max(2200);
export const zName    = z.string().trim().min(1, "Name is required").max(100);
export const zNotes   = z.string().trim().max(1000).nullable().optional();
export const zDateStr = z.string().refine((s) => !isNaN(Date.parse(s)), { message: "Invalid date" });

// ── Enums ─────────────────────────────────────────────────────────────────────
export const zCategory = z.enum([
  "HOUSE_MAINTENANCE","LOAN","CHIT_FUND","CREDIT_CARD",
  "SAVINGS","PERSONAL","MISCELLANEOUS",
  "SALARY","FREELANCE","RENTAL","BUSINESS","INVESTMENTS","OTHER_INCOME",
]);
export const zReceivableCategory = z.enum(["INVESTMENT","PERSONAL_LOAN","CUSTOM"]);
export const zReceivableStatus   = z.enum(["PENDING","RECEIVED"]);
export const zTemplateType       = z.enum(["EXPENSE","INCOME"]);
export const zFrequency          = z.enum(["MONTHLY","YEARLY"]);
export const zAdHocType          = z.enum(["INCOME","EXPENSE"]);
export const zPlanType           = z.enum(["FREE","WEEKLY","MONTHLY","QUARTERLY","YEARLY"]);
export const zRole               = z.enum(["ADMIN","USER"]);

// ── Route schemas ─────────────────────────────────────────────────────────────
export const AdminPatchSchema = z.object({
  userId:   z.string().min(1),
  role:     zRole.optional(),
  isActive: z.boolean().optional(),
}).refine((d) => d.role !== undefined || d.isActive !== undefined, {
  message: "Must provide role or isActive",
});

export const MonthPostSchema = z.object({
  month:        zMonth,
  year:         zYear,
  salaryIncome: zMoney.optional(),
});

export const MonthPatchSchema = z.object({
  salaryIncome:    zMoney.optional(),
  freelanceIncome: zMoney.optional(),
  otherIncome:     zMoney.optional(),
});

export const EntryPatchSchema = z.object({
  entryId:        z.string().min(1),
  isPaid:         z.boolean().optional(),
  amount:         zMoney.optional(),
  billedAmount:   zMoney.optional(),
  notes:          zNotes,
  statementAmount: z.number().finite().min(0).nullable().optional(),
  paidAmount:     z.number().finite().min(0).nullable().optional(),
  cashbackAmount: z.number().finite().min(0).nullable().optional(),
});

export const AdHocPostSchema = z.object({
  name:         zName,
  amount:       z.number().finite().positive(),
  type:         zAdHocType,
  category:     zCategory.optional(),
  date:         zDateStr,
  notes:        zNotes,
  ccTemplateId: z.string().optional(),
});

export const TemplatePostSchema = z.object({
  name:                  zName,
  category:              zCategory,
  customCategory:        z.string().trim().max(50).optional().nullable(),
  amount:                zMoney,
  isFixed:               z.boolean().optional(),
  dueDateDay:            zDay.optional().nullable(),
  statementDay:          zDay.optional().nullable(),
  frequency:             zFrequency.optional(),
  dueMonth:              zMonth.optional().nullable(),
  templateType:          zTemplateType.optional(),
  endsOnMonth:           zMonth.optional().nullable(),
  endsOnYear:            zYear.optional().nullable(),
  sortOrder:             z.number().int().optional(),
  loanOriginalPrincipal: zMoney.optional().nullable(),
  loanInterestRate:      z.number().finite().min(0).max(100).optional().nullable(),
  loanRateType:          z.enum(["FIXED","FLOATING"]).optional().nullable(),
  loanStartDate:         zDateStr.optional().nullable(),
  loanOutstandingOverride: zMoney.optional().nullable(),
  addToCurrentMonth:     z.boolean().optional(),
});

export const TemplatePatchSchema = z.object({
  name:             zName.optional(),
  category:         zCategory.optional(),
  customCategory:   z.string().trim().max(50).optional().nullable(),
  amount:           zMoney.optional(),
  isFixed:          z.boolean().optional(),
  dueDateDay:       zDay.optional().nullable(),
  statementDay:     zDay.optional().nullable(),
  frequency:        zFrequency.optional(),
  dueMonth:         zMonth.optional().nullable(),
  isActive:         z.boolean().optional(),
  sortOrder:        z.number().int().optional(),
  foreClosedOn:     zDateStr.optional().nullable(),
  foreCloseAmount:  zMoney.optional().nullable(),
  pendingAmount:    zMoney.optional().nullable(),
  pendingFromMonth: zMonth.optional().nullable(),
  pendingFromYear:  zYear.optional().nullable(),
  clearPending:     z.boolean().optional(),
  endsOnMonth:      zMonth.optional().nullable(),
  endsOnYear:       zYear.optional().nullable(),
  clearEndDate:     z.boolean().optional(),
  loanOriginalPrincipal: zMoney.optional().nullable(),
  loanInterestRate: z.number().finite().min(0).max(100).optional().nullable(),
  loanRateType:     z.enum(["FIXED","FLOATING"]).optional().nullable(),
  loanStartDate:    zDateStr.optional().nullable(),
  loanOutstandingOverride: zMoney.optional().nullable(),
  addToCurrentMonth: z.boolean().optional(),
  note:             zNotes,
});

export const ReceivablePostSchema = z.object({
  category:       zReceivableCategory,
  customCategory: z.string().trim().max(50).optional().nullable(),
  description:    zName,
  expectedAmount: zMoney,
  expectedDate:   zDateStr.optional().nullable(),
});

export const ReceivablePatchSchema = z.object({
  status:          zReceivableStatus.optional(),
  receivedAmount:  zMoney.optional().nullable(),
  receivedDate:    zDateStr.optional().nullable(),
  receivedMonthId: z.string().optional().nullable(),
  description:     zName.optional(),
  expectedAmount:  zMoney.optional(),
  expectedDate:    zDateStr.optional().nullable(),
  category:        zReceivableCategory.optional(),
  customCategory:  z.string().trim().max(50).optional().nullable(),
  receivedMonth:   zMonth.optional().nullable(),
  receivedYear:    zYear.optional().nullable(),
});

export const ChitPostSchema = z.object({
  name:                 zName,
  monthlyUnliftedAmount: zMoney,
  dueDateDay:           zDay.optional().nullable(),
  sortOrder:            z.number().int().optional(),
  totalValue:           zMoney,
  durationMonths:       z.number().int().min(1).max(120),
  startDate:            zDateStr,
  monthlyLiftedAmount:  zMoney.optional().nullable(),
  endDate:              zDateStr.optional().nullable(),
});

export const PaymentOrderSchema = z.object({
  planType: zPlanType.exclude(["FREE"]),
});

export const PaymentVerifySchema = z.object({
  razorpay_order_id:   z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature:  z.string().min(1),
});

// ── Helper ────────────────────────────────────────────────────────────────────
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid input", fields: result.error.flatten().fieldErrors },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: result.data };
}
