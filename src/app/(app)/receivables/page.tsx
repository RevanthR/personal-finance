import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ReceivablesClient } from "@/components/receivables/receivables-client";
import { getCurrentMonthYear } from "@/lib/utils";

export default async function ReceivablesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { month, year } = getCurrentMonthYear();

  const [chits, receivables, cards, currentMonth] = await Promise.all([
    db.chitFund.findMany({
      where: { userId },
      include: { template: true },
      orderBy: { startDate: "asc" },
    }),
    db.receivable.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    db.creditCard.findMany({
      where: { userId },
      include: {
        template: {
          select: { id: true, name: true, isActive: true, statementDay: true, dueDateDay: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.month.findUnique({
      where: { userId_month_year: { userId, month, year } },
      select: {
        entries: {
          where: { template: { category: "CREDIT_CARD" } },
          select: {
            id: true, templateId: true,
            amount: true, billedAmount: true,
            isPaid: true, paidAmount: true, cashbackAmount: true,
            statementAmount: true,
          },
        },
      },
    }),
  ]);

  // Attach current month entry to each card
  const entryByTemplateId = new Map(
    (currentMonth?.entries ?? []).map(e => [e.templateId, e])
  );
  const cardsWithEntry = cards.map(c => ({
    ...c,
    currentEntry: entryByTemplateId.get(c.template.id) ?? null,
  }));

  return (
    <ReceivablesClient
      chits={JSON.parse(JSON.stringify(chits))}
      receivables={JSON.parse(JSON.stringify(receivables))}
      cards={JSON.parse(JSON.stringify(cardsWithEntry))}
      currentMonthLabel={new Date(year, month - 1).toLocaleString("en-IN", { month: "long", year: "numeric" })}
    />
  );
}
