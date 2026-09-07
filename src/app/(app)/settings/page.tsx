import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings-client";
import { getCashBalance } from "@/lib/cash-balance";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [dbUser, cash] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, select: { payDay: true } }),
    getCashBalance(session.user.id),
  ]);

  return (
    <SettingsClient
      user={JSON.parse(JSON.stringify(session.user))}
      payDay={dbUser?.payDay ?? 1}
      cash={{ balance: cash.balance, anchorBalance: cash.anchorBalance, anchorAsOf: cash.anchorAsOf.toISOString() }}
    />
  );
}
