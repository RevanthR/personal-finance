"use client";

import { useState, useEffect } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export type PlatformType = "android" | "ios" | "desktop" | null;

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(true); // assume installed until we check
  const [platform, setPlatform] = useState<PlatformType>(null);
  const [isDismissed, setIsDismissed] = useState(true); // assume dismissed until we check

  useEffect(() => {
    // Check if running as standalone PWA
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);

    if (standalone) return; // already installed — don't show anything

    // Check if dismissed recently (re-show after 7 days)
    const dismissedAt = localStorage.getItem("fineos_pwa_dismissed");
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) return;

    setIsInstalled(false);
    setIsDismissed(false);

    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) {
      setPlatform("ios");
    } else if (/android/i.test(ua)) {
      setPlatform("android");
    } else {
      setPlatform("desktop");
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") dismiss();
    setDeferredPrompt(null);
  }

  function dismiss() {
    localStorage.setItem("fineos_pwa_dismissed", String(Date.now()));
    setIsDismissed(true);
  }

  const show = !isInstalled && !isDismissed;
  const canPrompt = !!deferredPrompt; // Android/desktop with native prompt available

  return { show, platform, canPrompt, install, dismiss };
}
