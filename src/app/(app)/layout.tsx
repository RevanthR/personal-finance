import { getSession } from "@/lib/get-session";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shared/sidebar";
import { Header } from "@/components/shared/header";
import { NavProgress } from "@/components/shared/nav-progress";
import { PrivacyProvider } from "@/contexts/privacy-context";
import { LegalFooter } from "@/components/shared/legal-footer";
import { WelcomeModal } from "@/components/coach/welcome-modal";
import { PwaInstallBanner } from "@/components/shared/pwa-install-banner";
import { PullToRefresh } from "@/components/shared/pull-to-refresh";
import { TrialBanner } from "@/components/shared/trial-banner";
import { isAccessAllowed, isTrialActive } from "@/lib/plans";
import { db } from "@/lib/db";
import { findExistingMatches, findParsedTransactionDuplicates } from "@/lib/gmail/dedupe";
import { Suspense } from "react";

// Server-computed so it updates on every navigation and every router.refresh()
// call, rather than only fetching once on the Sidebar's mount — a stale
// count is otherwise invisible until a full page reload.
async function getImportsBadge(userId: string): Promise<number> {
  const pending = await db.parsedTransaction.findMany({
    where: { userId, status: "PENDING" },
    select: { id: true, date: true, amount: true, last4: true, merchant: true, bank: true, createdAt: true },
  });
  if (pending.length === 0) return 0;

  const matches = await findExistingMatches(userId, pending);
  const dupes = findParsedTransactionDuplicates(pending);
  return pending.filter(p => !matches.get(p.id) && !dupes.get(p.id)).length;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "ADMIN";
  const user = session.user;

  if (!user.isActive) redirect("/login");

  // Admins always have access
  if (!isAdmin && !isAccessAllowed({ trialEndsAt: user.trialEndsAt, planExpiry: user.planExpiry })) {
    redirect("/pricing");
  }

  const showTrialBanner = !isAdmin && isTrialActive(user.trialEndsAt) && !user.planExpiry;
  const importsBadge = await getImportsBadge(user.id);

  return (
    <PrivacyProvider>
      <WelcomeModal />
      <PwaInstallBanner />
      <PullToRefresh />
      <div className="flex flex-col h-screen overflow-hidden bg-white">
        {showTrialBanner && <TrialBanner trialEndsAt={user.trialEndsAt!} />}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <Suspense><NavProgress /></Suspense>
          <Sidebar isAdmin={isAdmin} importsBadge={importsBadge} />
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <Header user={session.user} />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-28 md:pb-6">
              {children}
              <LegalFooter />
            </main>
          </div>
        </div>
      </div>
    </PrivacyProvider>
  );
}
