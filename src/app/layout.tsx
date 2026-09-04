import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/shared/sw-register";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Artha",
  description: "Personal finance tracker",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png",   sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    // "default" (not "black-translucent"): the iOS status bar keeps its own
    // opaque background and the web view starts BELOW it, instead of the
    // page drawing edge-to-edge under a translucent bar — which put a
    // frosted band around the clock. theme-color below sets that bar's
    // colour to match the header exactly, so there's no seam.
    statusBarStyle: "default",
    title: "Artha",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1d20" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
