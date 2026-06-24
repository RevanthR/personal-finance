import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getCurrentMonthYear } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { month, year } = getCurrentMonthYear();

  // Get or create current month
  let currentMonth = await db.month.findUnique({
    where: { userId_month_year: { userId: session.user.id, month, year } },
    include: {
      entries: {
        include: { template: { include: { chitFund: true } } },
        orderBy: { template: { sortOrder: "asc" } },
      },
      adHocItems: { orderBy: { date: "desc" } },
    },
  });

  // Get last 6 months for trend chart
  const recentMonths = await db.month.findMany({
    where: { userId: session.user.id },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 6,
    include: {
      entries: true,
      adHocItems: true,
    },
  });

  // Get chit funds
  const chitFunds = await db.chitFund.findMany({
    where: { userId: session.user.id },
    include: { template: true },
    orderBy: { startDate: "asc" },
  });

  return (
    <DashboardClient
      currentMonth={currentMonth ? JSON.parse(JSON.stringify(currentMonth)) : null}
      recentMonths={JSON.parse(JSON.stringify(recentMonths))}
      chitFunds={JSON.parse(JSON.stringify(chitFunds))}
      todayMonth={month}
      todayYear={year}
      userId={session.user.id}
    />
  );
}
