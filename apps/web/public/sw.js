// Thoth service worker. v2 (Phase 8): never caches /unlock or /api. Phase 0: installable app + offline fallback page.
// Offline flashcard review is added in Phase 6 (see docs/decision/0007).
const VERSION = "v2";
const STATIC_CACHE = `thoth-static-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never touch the passcode gate or data: no cache, no offline fallback, straight to the network.
  // (A cached /unlock or API response could outlive the session cookie that protected it.)
  if (
    url.pathname === "/unlock" ||
    url.pathname.startsWith("/unlock/") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: always network (data is live), fall back to the offline page.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
