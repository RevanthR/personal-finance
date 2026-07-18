import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { findExistingMatches, findParsedTransactionDuplicates } from "@/lib/gmail/dedupe";
import { findEntryMatches } from "@/lib/gmail/entry-match";

// GET /api/gmail/parsed — pending review-queue items for the current user,
// each annotated with a possible match against an existing manually-entered
// AdHocItem (or another pending import reporting the same charge). GET
// /api/gmail/parsed?countOnly=1 returns just the count of actionable
// (unmatched) items, for the nav badge.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const items = await db.parsedTransaction.findMany({
    where: { userId, status: "PENDING" },
    orderBy: { date: "desc" },
  });

  const matches = await findExistingMatches(userId, items.map(i => ({ id: i.id, date: i.date, amount: i.amount, merchant: i.merchant })));
  const dupes = findParsedTransactionDuplicates(
    items.map(i => ({ id: i.id, date: i.date, amount: i.amount, last4: i.last4, merchant: i.merchant, bank: i.bank, createdAt: i.createdAt })),
  );
  const entryMatches = await findEntryMatches(
    userId,
    items.map(i => ({ id: i.id, date: i.date, amount: i.amount, merchant: i.merchant, bank: i.bank, paymentMethod: i.paymentMethod })),
  );
  const withMatches = items.map(i => ({
    ...i,
    possibleMatch: matches.get(i.id) ?? dupes.get(i.id) ?? null,
    matchedEntry: entryMatches.get(i.id) ?? null,
  }));

  if (req.nextUrl.searchParams.get("countOnly")) {
    const actionable = withMatches.filter(i => !i.possibleMatch).length;
    return NextResponse.json({ count: actionable });
  }

  return NextResponse.json({ items: withMatches });
}
