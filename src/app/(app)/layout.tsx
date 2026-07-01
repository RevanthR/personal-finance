import { getSession } from "@/lib/get-session";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shared/sidebar";
import { Header } from "@/components/shared/header";
import { NavProgress } from "@/components/shared/nav-progress";
import { PrivacyProvider } from "@/contexts/privacy-context";
import { LegalFooter } from "@/components/shared/legal-footer";
import { WelcomeModal } from "@/components/coach/welcome-modal";
import { PwaInstallBanner } from "@/components/shared/pwa-install-banner";
import { Suspense } from "react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "ADMIN";

  return (
    <PrivacyProvider>
      <WelcomeModal />
      <PwaInstallBanner />
      <div className="flex h-screen overflow-hidden bg-zinc-50">
        <Suspense><NavProgress /></Suspense>
        <Sidebar isAdmin={isAdmin} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header user={session.user} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-28 md:pb-6">
            {children}
            <LegalFooter />
          </main>
        </div>
      </div>
    </PrivacyProvider>
  );
}
