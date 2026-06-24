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

  const recentMonths = await db.month.findMany({
    where: { userId: session.user.id },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 6,
    include: { entries: true, adHocItems: true },
  });

  const chitFunds = await db.chitFund.findMany({
    where: { userId: session.user.id },
    include: { template: true },
  });

  return (
    <DashboardClient
      currentMonth={JSON.parse(JSON.stringify(currentMonth))}
      recentMonths={JSON.parse(JSON.stringify(recentMonths))}
      chitFunds={JSON.parse(JSON.stringify(chitFunds))}
      todayMonth={currentMonth.month}
      todayYear={currentMonth.year}
      userId={session.user.id}
    />
  );
}
