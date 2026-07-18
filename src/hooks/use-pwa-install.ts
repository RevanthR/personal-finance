"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export type PlatformType = "android" | "ios" | "desktop" | null;

type InstallSnapshot = { show: boolean; platform: PlatformType };

// Standalone-mode / recently-dismissed / platform checks are all
// synchronous browser-only reads (matchMedia, localStorage, userAgent) —
// previously computed inside a useEffect that then called setIsInstalled/
// setIsDismissed/setPlatform synchronously in its body, which is exactly
// the react-hooks/set-state-in-effect anti-pattern. Computed once, lazily,
// on first client access via useSyncExternalStore instead — static for the
// page's lifetime, so no real subscription is needed beyond the initial
// SSR-safe default.
let cached: InstallSnapshot | null = null;
function computeSnapshot(): InstallSnapshot {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
  if (standalone) return { show: false, platform: null };

  const dismissedAt = localStorage.getItem("fineos_pwa_dismissed");
  if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) return { show: false, platform: null };

  const ua = navigator.userAgent;
  const platform: PlatformType = /iphone|ipad|ipod/i.test(ua) ? "ios" : /android/i.test(ua) ? "android" : "desktop";
  return { show: true, platform };
}
function subscribe() { return () => {}; }
function getSnapshot(): InstallSnapshot {
  if (cached === null) cached = computeSnapshot();
  return cached;
}
function getServerSnapshot(): InstallSnapshot {
  return { show: false, platform: null };
}

export function usePwaInstall() {
  const { show: canShow, platform } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  // A genuine external subscription (the browser firing an install-prompt
  // event) — setDeferredPrompt runs inside the event callback, not
  // synchronously in the effect body, so this one doesn't trip the same
  // lint rule.
  useEffect(() => {
    if (!canShow) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [canShow]);

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

  const show = canShow && !isDismissed;
  const canPrompt = !!deferredPrompt; // Android/desktop with native prompt available

  return { show, platform, canPrompt, install, dismiss };
}
