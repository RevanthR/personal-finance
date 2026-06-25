import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getCurrentMonthYear } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { month, year } = getCurrentMonthYear();

  const [currentMonth, recentMonths, chitFunds, ccTemplates] = await Promise.all([
    db.month.findUnique({
      where: { userId_month_year: { userId: session.user.id, month, year } },
      include: {
        entries: {
          include: { template: { include: { chitFund: true } } },
          orderBy: { template: { sortOrder: "asc" } },
        },
        adHocItems: { orderBy: { date: "desc" } },
      },
    }),
    db.month.findMany({
      where: { userId: session.user.id },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 6,
      include: { entries: true, adHocItems: true },
    }),
    db.chitFund.findMany({
      where: { userId: session.user.id },
      include: { template: true },
      orderBy: { startDate: "asc" },
    }),
    db.lineItemTemplate.findMany({
      where: { userId: session.user.id, category: "CREDIT_CARD", isActive: true },
      select: { id: true, name: true, statementDay: true, dueDateDay: true },
    }),
  ]);

  return (
    <DashboardClient
      currentMonth={currentMonth ? JSON.parse(JSON.stringify(currentMonth)) : null}
      recentMonths={JSON.parse(JSON.stringify(recentMonths))}
      chitFunds={JSON.parse(JSON.stringify(chitFunds))}
      ccTemplates={JSON.parse(JSON.stringify(ccTemplates))}
      todayMonth={month}
      todayYear={year}
      userId={session.user.id}
    />
  );
}
