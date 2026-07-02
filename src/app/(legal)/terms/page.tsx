export const metadata = { title: "Terms & Conditions | FinanceOS" };

export default function TermsPage() {
  return (
    <article className="prose prose-zinc max-w-none">
      <h1 className="text-2xl font-bold mb-1">Terms &amp; Conditions</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: June 2025</p>

      <section className="space-y-6 text-sm leading-relaxed text-zinc-700">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">1. Acceptance of Terms</h2>
          <p>By accessing or using FinanceOS (&ldquo;the Service&rdquo;), you agree to be bound by these Terms &amp; Conditions. If you do not agree, please do not use the Service.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">2. Description of Service</h2>
          <p>FinanceOS is a personal finance tracking web application that allows users to manage recurring income, expenses, loans, chit funds, and receivables. The Service is provided on a subscription basis.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">3. User Accounts</h2>
          <p>Access to FinanceOS requires authentication via Google OAuth. You are responsible for maintaining the confidentiality of your account and all activity that occurs under it. You must notify us immediately of any unauthorised use at revanth.rallabandi@gmail.com.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">4. Subscription and Payments</h2>
          <p>FinanceOS offers paid subscription plans (Weekly, Monthly, Quarterly, Yearly). Payments are processed securely via Razorpay. By subscribing, you authorise us to charge the applicable fee to your chosen payment method. All prices are inclusive of applicable taxes.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">5. Acceptable Use</h2>
          <p>You agree not to misuse the Service, attempt to gain unauthorised access, reverse-engineer any part of the platform, or use the Service for unlawful purposes.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">6. Data and Privacy</h2>
          <p>Your use of the Service is also governed by our <a href="/privacy" className="text-zinc-900 underline">Privacy Policy</a>. Financial data you enter is stored securely and used solely to provide the Service to you.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">7. Limitation of Liability</h2>
          <p>FinanceOS is a personal finance tracking tool and does not constitute financial advice. We are not liable for any financial decisions made based on information displayed in the app. The Service is provided &ldquo;as is&rdquo; without warranties of any kind.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">8. Changes to Terms</h2>
          <p>We reserve the right to update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the revised Terms.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">9. Contact</h2>
          <p>For questions about these Terms, contact us at <a href="mailto:revanth.rallabandi@gmail.com" className="text-zinc-900 underline">revanth.rallabandi@gmail.com</a>.</p>
        </div>
      </section>
    </article>
  );
}
