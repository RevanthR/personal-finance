import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LegalFooter } from "@/components/shared/legal-footer";
import { InstallInstructions } from "@/components/auth/install-instructions";
import { HeroIllustration } from "@/components/auth/hero-illustration";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const isDisabled = error === "AccessDenied";

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">

        <HeroIllustration />

        <div className="w-full max-w-sm login-glass rounded-3xl shadow-xl p-8 flex flex-col items-center text-center -mt-2 mb-6">
          <div className="login-mark-glow w-14 h-14 bg-warning rounded-2xl flex items-center justify-center text-white text-2xl font-bold mb-5">
            ₹
          </div>
          <h1 className="login-wordmark text-3xl font-bold tracking-tight text-foreground">
            Artha
          </h1>
          <p className="text-sm text-muted-foreground mt-2 mb-7">
            Every rupee, tracked.
          </p>

          {isDisabled && (
            <div className="w-full mb-5 rounded-xl bg-negative-bg border border-negative-border px-4 py-3 text-sm text-negative text-left">
              This account has been disabled. Contact support if you think this is a mistake.
            </div>
          )}

          <form
            className="w-full"
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <Button
              type="submit"
              className="w-full h-12 cursor-pointer group relative overflow-hidden transition-shadow hover:shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_18%,transparent)]"
            >
              <span className="login-shine" />
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
        </div>

        <InstallInstructions />
      </div>
      <LegalFooter />
    </div>
  );
}
