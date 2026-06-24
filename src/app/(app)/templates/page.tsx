import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { TemplatesClient } from "@/components/templates-client";

export default async function TemplatesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const templates = await db.lineItemTemplate.findMany({
    where: { userId: session.user.id },
    include: { chitFund: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });

  return <TemplatesClient templates={JSON.parse(JSON.stringify(templates))} />;
}
