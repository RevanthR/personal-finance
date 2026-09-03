// Service Worker for Artha PWA
const STATIC_CACHE = "artha-static-v1";
const PAGE_CACHE   = "artha-pages-v1";
const OFFLINE_URL  = "/offline.html";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([OFFLINE_URL, "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"])
    )
  );
});

self.addEventListener("activate", (event) => {
  const known = new Set([STATIC_CACHE, PAGE_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !known.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // API routes — always network; never serve stale financial data
  if (url.pathname.startsWith("/api/")) return;

  // Next.js JS/CSS bundles — content-hashed, cache-first forever
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(STATIC_CACHE, request));
    return;
  }

  // Icons and manifest — cache-first
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.json") {
    event.respondWith(cacheFirst(STATIC_CACHE, request));
    return;
  }

  // Page HTML / RSC navigation payloads — network-first: these embed live
  // DB data rendered server-side, so a stale cache hit shows outdated
  // financial data after edits. Only fall back to cache when truly offline.
  event.respondWith(networkFirst(PAGE_CACHE, request));
});

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offlineCache = await caches.open(STATIC_CACHE);
    return (await offlineCache.match(OFFLINE_URL)) ?? Response.error();
  }
}

// Push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};

  // A "close" push carries no visible notification of its own — it's sent
  // when the thing an earlier notification was about (review a synced
  // transaction, pay a due bill) got handled from a DIFFERENT device, so
  // this device's still-showing notification needs to go away too. Matches
  // by `tag` (see PushPayload in src/lib/push.ts) OR by the notification's
  // own target url — a notification shown before this tagging existed has
  // no tag to match, but still carries the same url, so it's still reachable.
  if (data.type === "close" && (data.tag || data.url)) {
    event.waitUntil(
      (async () => {
        const notifications = await self.registration.getNotifications();
        for (const n of notifications) {
          if ((data.tag && n.tag === data.tag) || (data.url && n.data?.url === data.url)) n.close();
        }

        // Browsers require every push to a userVisibleOnly subscription to
        // result in a visible notification, or they eventually revoke the
        // subscription outright for "silent push" abuse — which is exactly
        // what a close-only push (no showNotification call) used to be. The
        // server only sends this when a notification is actually showing
        // somewhere (see closePushForUser in src/lib/push.ts), so by the
        // time this runs there's something real to say — show that instead
        // of a blank flash, then close it right away rather than leaving it
        // sitting in the tray.
        const silentTag = `silent-${data.tag ?? "close"}`;
        await self.registration.showNotification("Handled on another device", {
          body: "Cleared, no action needed here.",
          tag: silentTag,
          silent: true,
          requireInteraction: false,
        });
        const placeholder = await self.registration.getNotifications({ tag: silentTag });
        placeholder.forEach((n) => n.close());

        if (data.tag === "gmail-sync") {
          const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
          for (const w of wins) w.postMessage({ type: "gmail-sync-updated" });
        }
      })()
    );
    return;
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title ?? "Artha", {
        body: data.body ?? "You have a pending payment",
        // Same tag as a previous notification replaces it in place (on THIS
        // device) instead of stacking a second, now-stale one — e.g. a
        // gmail-sync count that changed after reviewing some of the batch.
        ...(data.tag && { tag: data.tag }),
        data: { url: data.url ?? "/dashboard" },
        actions: [{ action: "open", title: "View" }],
      });

      // Nudge any open tab to refresh its unread-sync badge right away
      // instead of waiting for the next 20s poll (see useImportsBadge).
      if (data.tag === "gmail-sync") {
        const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const w of wins) w.postMessage({ type: "gmail-sync-updated" });
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
