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

  const [recentMonths, chitFunds, ccTemplates] = await Promise.all([
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
  ]);

  return (
    <DashboardClient
      currentMonth={JSON.parse(JSON.stringify(currentMonth))}
      recentMonths={JSON.parse(JSON.stringify(recentMonths))}
      chitFunds={JSON.parse(JSON.stringify(chitFunds))}
      ccTemplates={JSON.parse(JSON.stringify(ccTemplates))}
      todayMonth={currentMonth.month}
      todayYear={currentMonth.year}
      userId={session.user.id}
    />
  );
}
