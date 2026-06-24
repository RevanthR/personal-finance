import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ChitsClient } from "@/components/chits/chits-client";

export default async function ChitsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const chits = await db.chitFund.findMany({
    where: { userId: session.user.id },
    include: { template: true },
    orderBy: { startDate: "asc" },
  });

  return <ChitsClient chits={JSON.parse(JSON.stringify(chits))} />;
}
