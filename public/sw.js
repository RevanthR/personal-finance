// Service Worker for FinanceOS PWA
const STATIC_CACHE = "financeos-static-v3";
const PAGE_CACHE   = "financeos-pages-v3";
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

  // Page HTML — stale-while-revalidate: serve cached shell instantly,
  // fetch fresh version in background. Repeat opens are instant even on cold server.
  event.respondWith(staleWhileRevalidate(PAGE_CACHE, request));
});

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Always kick off a background fetch to keep cache fresh
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  // Return cached version immediately if available (instant open),
  // otherwise wait for network; fall back to offline page on total failure
  if (cached) return cached;
  const response = await fetchPromise;
  if (response) return response;
  const offlineCache = await caches.open(STATIC_CACHE);
  return (await offlineCache.match(OFFLINE_URL)) ?? Response.error();
}

// Push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "FinanceOS", {
      body: data.body ?? "You have a pending payment",
      data: { url: data.url ?? "/dashboard" },
      actions: [{ action: "open", title: "View" }],
    })
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
