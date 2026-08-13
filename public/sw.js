/*
 * Puzzles are generated on-device, so once the shell is cached the whole game
 * works with no network at all.
 */
const CACHE = "queens-v3";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The leaderboard is live data, never the shell — always hit the network.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: try the network so updates land, fall back to the cached shell.
  //
  // Reaching this app through a reverse proxy (Tailscale Serve) means a stopped
  // origin server comes back as a *successful* fetch carrying a 502, not as a
  // rejection. So an unreachable app must be detected by status, not by catch —
  // otherwise the error page is served, and cached over the shell.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const copy = res.clone();
            const c = await caches.open(CACHE);
            await c.put("/", copy);
            return res;
          }
          return (await caches.match("/")) || res;
        } catch {
          return (await caches.match("/")) || Response.error();
        }
      })(),
    );
    return;
  }

  // Assets: serve from cache immediately, refresh in the background. Hashed
  // build output means a cache hit is always the right answer.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return cached && !res.ok ? cached : res;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});
