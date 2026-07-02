export const metadata = { title: "Privacy Policy | FinanceOS" };

export default function PrivacyPage() {
  return (
    <article className="prose prose-zinc max-w-none">
      <h1 className="text-2xl font-bold mb-1">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: June 2025</p>

      <section className="space-y-6 text-sm leading-relaxed text-zinc-700">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">1. Information We Collect</h2>
          <p>We collect the following information when you use FinanceOS:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Account information:</strong> Name, email address, and profile picture provided by Google OAuth during sign-in.</li>
            <li><strong>Financial data:</strong> Income, expenses, loan details, chit fund records, and receivables that you manually enter into the app.</li>
            <li><strong>Payment information:</strong> Transaction records for subscriptions (processed via Razorpay; we do not store card or UPI credentials).</li>
            <li><strong>Device data:</strong> Push notification tokens if you opt in to notifications.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">2. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To provide and personalise the FinanceOS service to you.</li>
            <li>To process subscription payments and maintain your account status.</li>
            <li>To send push notifications you have opted into.</li>
            <li>To improve and maintain the platform.</li>
          </ul>
          <p className="mt-2">We do not sell, rent, or share your personal or financial data with third parties for marketing purposes.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">3. Data Storage and Security</h2>
          <p>Your data is stored on Neon PostgreSQL (hosted on AWS). We use industry-standard security practices including encrypted connections (TLS) and secure authentication. Only you can access your financial data.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">4. Third-Party Services</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Google OAuth:</strong> Used for authentication. Governed by <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-zinc-900 underline">Google&apos;s Privacy Policy</a>.</li>
            <li><strong>Razorpay:</strong> Used for payment processing. Governed by <a href="https://razorpay.com/privacy/" target="_blank" rel="noopener noreferrer" className="text-zinc-900 underline">Razorpay&apos;s Privacy Policy</a>.</li>
            <li><strong>Vercel:</strong> Hosting provider. Governed by <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-zinc-900 underline">Vercel&apos;s Privacy Policy</a>.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">5. Data Retention</h2>
          <p>We retain your data for as long as your account is active. You may request deletion of your account and associated data at any time by contacting us.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">6. Your Rights</h2>
          <p>You have the right to access, correct, or delete your personal data. To exercise these rights, contact us at <a href="mailto:revanth.rallabandi@gmail.com" className="text-zinc-900 underline">revanth.rallabandi@gmail.com</a>.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">7. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. Continued use of FinanceOS after changes constitutes acceptance of the revised policy.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">8. Contact</h2>
          <p>For privacy-related questions, contact <a href="mailto:revanth.rallabandi@gmail.com" className="text-zinc-900 underline">revanth.rallabandi@gmail.com</a>.</p>
        </div>
      </section>
    </article>
  );
}
