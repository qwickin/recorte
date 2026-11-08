// Recorte service worker: the app shell and static files only.
//
// - Never touches /api, /auth or /downloads (captures, thumbnails, sessions, ZIPs): those always go to the
//   network and are cached only by the browser's HTTP cache, as without a service worker.
// - Pages (navigations): network first, so sign-in redirects and upgrades apply at once; the cached shell
//   is the fallback when offline.
// - /assets/* (fingerprinted by Vite), /fonts/*, /icons/*: cache first.
const VERSION = "v1";
const SHELL = `recorte-shell-${VERSION}`;
const STATIC = `recorte-static-${VERSION}`;
const STATIC_MAX = 80;
const SERVER = ["/api", "/auth", "/downloads"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/", "/manifest.webmanifest", "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("recorte-") && k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isServer = (path) => SERVER.some((p) => path === p || path.startsWith(`${p}/`));

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - STATIC_MAX))) await cache.delete(k);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") {
    await cache.put(request, res.clone());
    trim(cache);
  }
  return res;
}

async function networkFirstPage(request) {
  try {
    const res = await fetch(request);
    // Keep the newest shell for offline (any SPA path answers with the same index.html).
    if (res.ok && res.type === "basic" && (res.headers.get("content-type") ?? "").startsWith("text/html")) {
      const cache = await caches.open(SHELL);
      await cache.put("/", res.clone());
    }
    return res;
  } catch (err) {
    const cached = await caches.match("/", { cacheName: SHELL });
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isServer(url.pathname)) return; // the network, untouched
  if (request.mode === "navigate") return event.respondWith(networkFirstPage(request));
  if (/^\/(assets|fonts|icons)\//.test(url.pathname)) return event.respondWith(cacheFirst(request));
});
