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

  const [recentMonths, ccTemplates, allTemplates, customCategories] = await Promise.all([
    db.month.findMany({
      where: { userId: session.user.id },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 6,
      select: {
        id: true, month: true, year: true,
        salaryIncome: true, freelanceIncome: true, otherIncome: true,
        entries: { select: { id: true, templateId: true, amount: true, cashbackAmount: true } },
        adHocItems: { select: { id: true, type: true, amount: true, category: true, notes: true } },
      },
    }),
    db.lineItemTemplate.findMany({
      where: { userId: session.user.id, category: "CREDIT_CARD", isActive: true },
      select: { id: true, name: true, statementDay: true, dueDateDay: true },
    }),
    db.lineItemTemplate.findMany({
      where: { userId: session.user.id, isActive: true },
      include: { chitFund: true },
    }),
    db.customCategory.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const incomeTemplates = allTemplates
    .filter(t => t.templateType === "INCOME")
    .map(t => ({
      id: t.id,
      name: t.name,
      amount: t.amount,
      pendingAmount: t.pendingAmount,
      pendingFromMonth: t.pendingFromMonth,
      pendingFromYear: t.pendingFromYear,
    }));

  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayYear  = now.getFullYear();

  return (
    <DashboardClient
      currentMonth={JSON.parse(JSON.stringify(currentMonth))}
      recentMonths={JSON.parse(JSON.stringify(recentMonths))}
      ccTemplates={JSON.parse(JSON.stringify(ccTemplates))}
      customCategories={customCategories}
      incomeTemplates={JSON.parse(JSON.stringify(incomeTemplates))}
      todayMonth={todayMonth}
      todayYear={todayYear}
      targetMonth={currentMonth.month}
      targetYear={currentMonth.year}
      userId={session.user.id}
    />
  );
}
