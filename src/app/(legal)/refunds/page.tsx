export const metadata = { title: "Cancellation & Refunds | FinanceOS" };

export default function RefundsPage() {
  return (
    <article className="prose prose-zinc max-w-none">
      <h1 className="text-2xl font-bold mb-1">Cancellation &amp; Refund Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: June 2025</p>

      <section className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <div>
          <h2 className="text-base font-semibold text-foreground mb-2">1. Subscription Plans</h2>
          <p>FinanceOS offers the following subscription plans, all providing full access to the platform:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Weekly:</strong> ₹29 for 7 days</li>
            <li><strong>Monthly:</strong> ₹99 for 30 days</li>
            <li><strong>Quarterly:</strong> ₹249 for 90 days</li>
            <li><strong>Yearly:</strong> ₹799 for 365 days</li>
          </ul>
          <p className="mt-2">Subscriptions are one-time payments and are not auto-renewed unless you manually purchase again.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground mb-2">2. Cancellation</h2>
          <p>Since FinanceOS subscriptions are one-time purchases (not recurring mandates), there is nothing to &ldquo;cancel&rdquo; in the traditional sense. Access continues until the end of the paid period and does not automatically renew.</p>
          <p className="mt-2">If you do not wish to continue using the service, simply do not repurchase when your plan expires.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground mb-2">3. Refund Policy</h2>
          <p>We offer refunds in the following circumstances:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Duplicate payment:</strong> If you are charged twice for the same plan period, we will refund the duplicate charge in full.</li>
            <li><strong>Service unavailability:</strong> If the service is unavailable for more than 72 consecutive hours due to a fault on our end during your active subscription period, you may request a proportional refund.</li>
            <li><strong>Technical failure:</strong> If your payment was deducted but your subscription was not activated due to a system error, we will activate your plan or issue a full refund.</li>
          </ul>
          <p className="mt-2">Refunds are <strong>not</strong> provided for change of mind, unused subscription days, or if you simply stop using the service before your plan expires.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground mb-2">4. How to Request a Refund</h2>
          <p>Email us at <a href="mailto:revanth.rallabandi@gmail.com" className="text-foreground underline">revanth.rallabandi@gmail.com</a> with:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Your registered email address</li>
            <li>Razorpay payment ID (visible in your UPI/bank statement)</li>
            <li>Reason for refund request</li>
          </ul>
          <p className="mt-2">We will respond within 2 business days. Approved refunds are processed within 5–7 business days to the original payment method.</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground mb-2">5. Contact</h2>
          <p>For any payment or refund queries, reach us at <a href="mailto:revanth.rallabandi@gmail.com" className="text-foreground underline">revanth.rallabandi@gmail.com</a>.</p>
        </div>
      </section>
    </article>
  );
}
