import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default async function MonthDetailPage({
  params,
}: {
  params: Promise<{ monthId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { monthId } = await params;

  const currentMonth = await db.month.findFirst({
    where: { id: monthId, userId: session.user.id },
    include: {
      entries: {
        include: { template: { include: { chitFund: true } } },
        orderBy: { template: { sortOrder: "asc" } },
      },
      adHocItems: { orderBy: { date: "desc" } },
    },
  });

  if (!currentMonth) notFound();

  const [recentMonths, chitFunds, ccTemplates, incomeTemplates] = await Promise.all([
    db.month.findMany({
      where: { userId: session.user.id },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 6,
      include: { entries: true, adHocItems: true },
    }),
    db.chitFund.findMany({
      where: { userId: session.user.id },
      include: { template: true },
    }),
    db.lineItemTemplate.findMany({
      where: { userId: session.user.id, category: "CREDIT_CARD", isActive: true },
      select: { id: true, name: true, statementDay: true, dueDateDay: true },
    }),
    db.lineItemTemplate.findMany({
      where: { userId: session.user.id, isActive: true },
    }),
  ]);

  // Sum income templates for the current month, applying any pending changes that have kicked in
  const suggestedIncome = incomeTemplates.filter(t => t.templateType === "INCOME").reduce((sum, t) => {
    const { month, year } = currentMonth;
    const usesPending = t.pendingAmount != null && t.pendingFromMonth != null && t.pendingFromYear != null &&
      (year > t.pendingFromYear || (year === t.pendingFromYear && month >= t.pendingFromMonth));
    return sum + (usesPending ? t.pendingAmount! : t.amount);
  }, 0);

  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayYear  = now.getFullYear();

  return (
    <DashboardClient
      currentMonth={JSON.parse(JSON.stringify(currentMonth))}
      recentMonths={JSON.parse(JSON.stringify(recentMonths))}
      chitFunds={JSON.parse(JSON.stringify(chitFunds))}
      ccTemplates={JSON.parse(JSON.stringify(ccTemplates))}
      suggestedIncome={suggestedIncome}
      todayMonth={todayMonth}
      todayYear={todayYear}
      targetMonth={currentMonth.month}
      targetYear={currentMonth.year}
      userId={session.user.id}
    />
  );
}
