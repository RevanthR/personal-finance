import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LegalFooter } from "@/components/shared/legal-footer";
import { Smartphone, Share2, PlusSquare, MoreVertical, Download } from "lucide-react";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const isDisabled = error === "AccessDenied";
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6">

        {/* Login card */}
        <Card className="w-full max-w-sm shadow-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 w-14 h-14 bg-warning rounded-xl flex items-center justify-center text-white text-xl font-bold">
              ₹
            </div>
            <CardTitle className="text-2xl font-bold">FinanceOS</CardTitle>
            <CardDescription className="text-sm">
              Your personal finance command centre
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {isDisabled && (
              <div className="mb-4 rounded-lg bg-negative-bg border border-negative-border px-4 py-3 text-sm text-negative">
                This account has been disabled. Contact support if you think this is a mistake.
              </div>
            )}
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/dashboard" });
              }}
            >
              <Button type="submit" className="w-full h-11 cursor-pointer">
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </Button>
            </form>
            <p className="text-center text-xs text-muted-foreground mt-4">
              Secure sign-in via Google OAuth
            </p>
          </CardContent>
        </Card>

        {/* PWA install instructions */}
        <div className="w-full max-w-sm space-y-3">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Install as an app for the best experience</p>
          </div>

          {/* iPhone */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-md bg-warning text-white text-xs flex items-center justify-center font-bold shrink-0">
              </span>
              iPhone / iPad (Safari)
            </p>
            <ol className="space-y-2">
              {[
                { icon: Share2, text: "Tap the Share button at the bottom of Safari" },
                { icon: PlusSquare, text: "Scroll down and tap \"Add to Home Screen\"" },
                { icon: Download, text: "Tap Add, the app icon appears on your home screen" },
              ].map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="w-4 h-4 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex items-start gap-1.5 flex-1">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Android */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-md bg-positive text-white text-xs flex items-center justify-center font-bold shrink-0">
                A
              </span>
              Android (Chrome)
            </p>
            <ol className="space-y-2">
              {[
                { icon: MoreVertical, text: "Tap the ⋮ menu in the top-right corner of Chrome" },
                { icon: Download, text: "Tap \"Add to Home screen\" or \"Install app\"" },
                { icon: PlusSquare, text: "Tap Install, FinanceOS is added to your home screen" },
              ].map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="w-4 h-4 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex items-start gap-1.5 flex-1">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <p className="text-center text-xs text-muted-foreground px-2">
            Once installed, it works like a native app: no browser chrome, faster load, works offline.
          </p>
        </div>

      </div>
      <LegalFooter />
    </div>
  );
}
