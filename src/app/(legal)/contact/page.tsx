export const metadata = { title: "Contact Us — FinanceOS" };

export default function ContactPage() {
  return (
    <article className="max-w-xl">
      <h1 className="text-2xl font-bold mb-1">Contact Us</h1>
      <p className="text-sm text-muted-foreground mb-8">We&apos;re happy to help with any questions or issues.</p>

      <div className="space-y-6 text-sm text-zinc-700">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Email</p>
            <a
              href="mailto:revanth.rallabandi@gmail.com"
              className="text-base font-medium text-zinc-900 hover:underline"
            >
              revanth.rallabandi@gmail.com
            </a>
            <p className="text-xs text-muted-foreground mt-1">We typically respond within 1–2 business days.</p>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Product</p>
            <p className="font-medium text-zinc-900">FinanceOS</p>
            <p className="text-xs text-muted-foreground mt-1">Personal finance tracking — dashboard, statistics, loans, chit funds, receivables.</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-medium text-zinc-900">What to include in your email</p>
          <ul className="list-disc pl-5 space-y-1 text-zinc-600">
            <li>Your registered email address (the one you signed in with)</li>
            <li>A description of the issue or question</li>
            <li>For payment issues: your Razorpay payment ID</li>
            <li>Screenshots if helpful</li>
          </ul>
        </div>

        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 space-y-1">
          <p className="font-medium text-zinc-900">Common topics</p>
          <ul className="space-y-1 text-zinc-600">
            <li>• Subscription activation or payment issues → <a href="mailto:revanth.rallabandi@gmail.com" className="text-zinc-900 underline">email us</a></li>
            <li>• Refund requests → see our <a href="/refunds" className="text-zinc-900 underline">Refund Policy</a></li>
            <li>• Data deletion requests → email with subject &ldquo;Delete my account&rdquo;</li>
            <li>• Feature requests or bug reports → email with subject &ldquo;Feedback&rdquo;</li>
          </ul>
        </div>
      </div>
    </article>
  );
}
