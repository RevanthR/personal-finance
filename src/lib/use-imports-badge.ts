"use client";

import { useEffect, useState } from "react";

// Live count of pending Gmail-import review items, shared by the desktop
// sidebar's "Sync" tile and the mobile header's Sync button. Sync happens
// silently in the background via push, so nothing tells the client it
// landed — this polls a single cheap count endpoint (not router.refresh(),
// which re-runs the whole server-component tree) on an interval, on tab
// focus, and on visibility change, so the badge stays live on any page.
export function useImportsBadge(initial = 0): number {
  const [count, setCount] = useState(initial);
  // Re-sync when the server-provided count changes on navigation. Done at
  // render (the "adjust state when a prop changes" pattern) rather than in
  // an effect, so it doesn't trigger a cascading render.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setCount(initial);
  }

  useEffect(() => {
    const poll = () => {
      fetch("/api/gmail/parsed/count")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setCount(d.count); })
        .catch(() => {});
    };
    const interval = setInterval(poll, 20_000);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") poll(); };
    // The service worker posts this the instant a gmail-sync push lands, so
    // the badge updates immediately instead of on the next 20s tick.
    const onSwMessage = (e: MessageEvent) => { if (e.data?.type === "gmail-sync-updated") poll(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", poll);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", poll);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, []);

  return count;
}
