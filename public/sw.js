/* global self, caches, fetch, Response, URL */
/* Counter-only offline shell (plan.md §8). Network-first so online always gets
   fresh assets; the cache only serves the /counter shell when offline. POSTs
   (taps/sync) are never intercepted — they go straight to the network. */

const CACHE = "mess-counter-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, isNavigation) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (isNavigation) {
      const shell = await caches.match("/counter");
      if (shell) return shell;
    }
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // never touch taps/sync POSTs

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isCounterNav = request.mode === "navigate" && url.pathname === "/counter";
  const isAsset = url.pathname.startsWith("/_next/") || url.pathname.startsWith("/assets/");
  if (!isCounterNav && !isAsset) return; // everything else: default network handling

  event.respondWith(networkFirst(request, isCounterNav));
});

/* Web Push (Notifications module): show the pushed payload and focus/open the
   app on click. Payloads are JSON { title, body, url } from lib/notifications. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Mess Management", {
      body: data.body || "",
      icon: "/assets/images/logo/logo-white.png",
      badge: "/assets/images/logo/logo-white.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of list) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
