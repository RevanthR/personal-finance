import Link from "next/link";
import { IndianRupee } from "lucide-react";
import { LegalFooter } from "@/components/shared/legal-footer";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-foreground">
            <div className="w-7 h-7 bg-foreground rounded-lg flex items-center justify-center">
              <IndianRupee className="w-3.5 h-3.5 text-background" />
            </div>
            Artha
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/login" className="text-foreground font-medium hover:underline">Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10">
        {children}
      </main>
      <LegalFooter />
    </div>
  );
}
