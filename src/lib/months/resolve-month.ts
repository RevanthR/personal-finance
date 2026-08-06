import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type DbClient = typeof db | Prisma.TransactionClient;

export type ResolvedMonth = { monthId: string; month: number; year: number; moved: boolean };

// An AdHocItem's date can be backdated (or postdated) across a month
// boundary from whichever month it's actually being added/edited in — a
// genuine July receipt logged while looking at August, say. Every write
// used to blindly file the item under whatever month was in the URL,
// which (a) made it invisible in the month its own date says it belongs
// to (every view keys off monthId, not date) and (b) fed CC statement
// math (isPreCloseDate) a date/month combination it assumes can never
// happen, silently misfiling the amount into the wrong cycle bucket.
//
// This resolves the REAL month a date belongs to, but only when that
// month's own record already exists. It deliberately does NOT auto-create
// a missing month — setupMonth's carry-forward math (opening balance, CC
// carry-in) is built to run forward one month at a time from whatever's
// already populated, and materializing an arbitrary historical or future
// month on the side just to satisfy one backdated entry risks fabricating
// wrong financial history for a month nobody ever actually set up. When
// the real month doesn't exist yet, callers keep the old (imperfect but
// safe) fallback of filing under the viewed month.
export async function resolveMonthForDate(
  client: DbClient,
  userId: string,
  date: Date,
  viewedMonth: { id: string; month: number; year: number },
): Promise<ResolvedMonth> {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month === viewedMonth.month && year === viewedMonth.year) {
    return { monthId: viewedMonth.id, month, year, moved: false };
  }
  const real = await client.month.findUnique({
    where: { userId_month_year: { userId, month, year } },
    select: { id: true },
  });
  if (!real) {
    return { monthId: viewedMonth.id, month: viewedMonth.month, year: viewedMonth.year, moved: false };
  }
  return { monthId: real.id, month, year, moved: true };
}
