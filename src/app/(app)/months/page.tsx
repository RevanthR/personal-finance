import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatMonthYear } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import type { MonthlyEntry, AdHocItem } from "@/generated/prisma/client";

export default async function MonthsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const months = await db.month.findMany({
    where: { userId: session.user.id },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: {
      entries: true,
      adHocItems: true,
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Monthly History</h1>

      {months.length === 0 ? (
        <p className="text-muted-foreground">No months recorded yet. Start from the dashboard.</p>
      ) : (
        <div className="space-y-2">
          {months.map((m) => {
            const income = m.salaryIncome + m.freelanceIncome + m.otherIncome;
            const adhocIncome = m.adHocItems.filter((i: AdHocItem) => i.type === "INCOME").reduce((s: number, i: AdHocItem) => s + i.amount, 0);
            const adhocExp = m.adHocItems.filter((i: AdHocItem) => i.type === "EXPENSE").reduce((s: number, i: AdHocItem) => s + i.amount, 0);
            const committed = m.entries.reduce((s: number, e: MonthlyEntry) => s + e.amount, 0);
            const balance = income + adhocIncome - committed - adhocExp;
            const paid = m.entries.filter((e: MonthlyEntry) => e.isPaid).length;
            const total = m.entries.length;

            return (
              <Link key={m.id} href={`/months/${m.id}`}>
                <Card className="hover:border-indigo-300 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{formatMonthYear(m.month, m.year)}</p>
                        <p className="text-sm text-muted-foreground">
                          {paid}/{total} paid · Income: {formatCurrency(income + adhocIncome)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className={`font-bold text-sm ${balance >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                            {balance >= 0 ? "+" : ""}{formatCurrency(balance)}
                          </p>
                          <Badge variant={paid === total ? "default" : "secondary"} className="text-xs">
                            {paid === total ? "Complete" : "In Progress"}
                          </Badge>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
