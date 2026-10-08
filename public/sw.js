// Offline-first service worker. Bump VERSION to invalidate old caches.
const VERSION = "v2";
const CACHE = `horarios-${VERSION}`;
const PRECACHE = ["/", "/equipo", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("horarios-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function put(request, response) {
  if (response && response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Only same-origin GETs; API calls (e.g. Supabase) always go to the network.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((r) => put(request, r))));
    return;
  }

  // Pages: network first, fall back to the cached copy of that page (or the main one) when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((r) => put(request, r))
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/")).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Everything else (icons, manifest): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request).then((r) => put(request, r)).catch(() => hit);
      return hit || network;
    }),
  );
});
