import type { Prisma } from "@/generated/prisma/client";
import type { Category } from "@/generated/prisma/client";

// A non-card bill (rent, insurance, an EMI) can be settled by swiping a
// credit card instead of paying cash. When that happens the bill is no
// longer owed, but the card now carries that spend — so we log it as a
// real charge on the card (an AdHocItem tagged with ccTemplateId). That
// makes it flow through cardStatus() / getCardBillsByMonth exactly like
// any other card spend: this cycle's unbilled spend now, a statement line
// once the cycle closes. Without this the amount vanished from every
// "still owed" figure.
//
// The charge is kept in sync with the entry: cleared when the bill is
// un-paid or switched back to cash, moved when a different card is chosen,
// amount refreshed when the bill amount or cashback changes.

const marker = (entryId: string) => `bill_via_card:${entryId}`;

export async function syncBillViaCardCharge(
  tx: Prisma.TransactionClient,
  opts: {
    userId: string;
    entryId: string;
    monthId: string;
    name: string;
    category: Category | null;
    /** The bill's amount net of cashback — what actually hit the card. */
    netAmount: number;
    /** The card this bill was paid with, or null when it wasn't (any existing charge is removed). */
    cardTemplateId: string | null;
    paidOn?: Date;
  },
): Promise<void> {
  const existing = await tx.adHocItem.findFirst({
    where: { notes: marker(opts.entryId), month: { userId: opts.userId } },
    select: { id: true },
  });

  if (!opts.cardTemplateId || opts.netAmount <= 0) {
    if (existing) await tx.adHocItem.delete({ where: { id: existing.id } });
    return;
  }

  const data = {
    monthId: opts.monthId,
    name: opts.name,
    amount: Math.round(opts.netAmount * 100) / 100,
    type: "EXPENSE" as const,
    category: opts.category,
    ccTemplateId: opts.cardTemplateId,
    isCredit: false,
    isCardRepayment: false,
    date: opts.paidOn ?? new Date(),
    notes: marker(opts.entryId),
  };

  if (existing) {
    await tx.adHocItem.update({ where: { id: existing.id }, data });
  } else {
    await tx.adHocItem.create({ data });
  }
}
