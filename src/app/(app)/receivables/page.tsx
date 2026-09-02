import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ReceivablesClient } from "@/components/receivables/receivables-client";

export default async function ReceivablesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [chits, receivables] = await Promise.all([
    db.chitFund.findMany({
      where: { userId },
      include: { template: true },
      orderBy: { startDate: "asc" },
    }),
    db.receivable.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <ReceivablesClient
      chits={JSON.parse(JSON.stringify(chits))}
      receivables={JSON.parse(JSON.stringify(receivables))}
    />
  );
}
