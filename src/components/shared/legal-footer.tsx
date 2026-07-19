import Link from "next/link";

export function LegalFooter() {
  return (
    <footer className="mt-8 pb-6 text-center space-y-2">
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Link href="/terms" className="hover:text-foreground transition-colors">Terms &amp; Conditions</Link>
        <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
        <Link href="/refunds" className="hover:text-foreground transition-colors">Cancellation &amp; Refunds</Link>
        <Link href="/contact" className="hover:text-foreground transition-colors">Contact Us</Link>
        <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
      </nav>
      <p className="text-xs text-muted-foreground">© 2025 Artha. All rights reserved.</p>
    </footer>
  );
}
