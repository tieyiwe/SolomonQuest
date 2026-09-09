// Replaced with a real value by scripts/inject-build-id.mjs after every
// build. Changing this string is what makes the browser notice a new
// service worker is available at all — an unchanged sw.js is never
// re-fetched or re-installed.
const CACHE_VERSION = "__BUILD_ID__";
const STATIC_CACHE = `sq-static-${CACHE_VERSION}`;

self.addEventListener("install", () => {
  // Deliberately no self.skipWaiting() here. A manual page refresh already
  // gets the newest HTML/JS (see the network-first navigation handling
  // below), and staying "waiting" until the user acts (or every open tab
  // for this app is closed) means an update never yanks the page out from
  // under someone mid-edit.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("sq-static-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Lets the page hand off control once the person has agreed to refresh
// (see src/lib/pwa.ts) instead of us silently activating mid-session.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations (page loads/refreshes) always go to the network so a
  // refresh can never serve a stale app shell. Falls back to the cached
  // shell only when fully offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // Vite's build output is content-hashed (the URL itself changes when the
  // content does), so caching these aggressively is always safe.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
  }
});
