import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { TemplatesClient } from "@/components/templates-client";

export default async function TemplatesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();

  const [templates, recentMonth, paidEntries] = await Promise.all([
    db.lineItemTemplate.findMany({
      where: { userId: session.user.id },
      include: { chitFund: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    }),
    db.month.findFirst({
      where: { userId: session.user.id, isPopulated: true },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { salaryIncome: true, freelanceIncome: true, otherIncome: true },
    }),
    db.monthlyEntry.findMany({
      where: {
        isPaid: true,
        month: { userId: session.user.id, month: curMonth, year: curYear },
      },
      select: { templateId: true },
    }),
  ]);

  const recentIncome = recentMonth && (recentMonth.salaryIncome + recentMonth.freelanceIncome + recentMonth.otherIncome) > 0
    ? { salary: recentMonth.salaryIncome, freelance: recentMonth.freelanceIncome, other: recentMonth.otherIncome }
    : null;

  const paidTemplateIds = paidEntries.map(e => e.templateId);

  return (
    <TemplatesClient
      templates={JSON.parse(JSON.stringify(templates))}
      recentIncome={recentIncome}
      paidTemplateIds={paidTemplateIds}
    />
  );
}
