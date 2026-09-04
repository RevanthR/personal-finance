"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // updateViaCache: "none" — always revalidate sw.js against the network
    // rather than trusting the HTTP cache, so a deploy's new worker is
    // picked up on the next load instead of up to a day later.
    let interval: ReturnType<typeof setInterval> | undefined;
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        // Check for a newer worker on load and roughly hourly while open.
        // sw.js calls skipWaiting + clients.claim, so a new worker starts
        // controlling fetches (and thus serving fresh page HTML/CSS on the
        // next navigation) as soon as it activates — no forced reload.
        reg.update().catch(() => {});
        interval = setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      })
      .catch(console.error);

    return () => { if (interval) clearInterval(interval); };
  }, []);

  return null;
}
