const CACHE_NAME = "streaks-shell-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];
const SHELL_PATHS = new Set(
  APP_SHELL.map(path => new URL(path, self.registration.scope).pathname)
);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(
      APP_SHELL.map(path => new Request(new URL(path, self.registration.scope).href, { cache: "reload" }))
    );
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith("streaks-shell-") && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !SHELL_PATHS.has(url.pathname)) return;

  const isNavigation = request.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/");

  if (isNavigation) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cacheKey = new URL(url.pathname, self.location.origin).href;
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put(cacheKey, response.clone());
          if (url.pathname.endsWith("/")) {
            await cache.put(new URL("./index.html", self.registration.scope).href, response.clone());
          } else if (url.pathname.endsWith("/index.html")) {
            await cache.put(new URL("./", self.registration.scope).href, response.clone());
          }
        }
        return response;
      } catch (_) {
        const cached = await cache.match(cacheKey)
          || await cache.match(new URL("./index.html", self.registration.scope).href)
          || await cache.match(new URL("./", self.registration.scope).href);
        if (cached) return cached;
        throw _;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = new URL(url.pathname, self.location.origin).href;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) await cache.put(cacheKey, response.clone());
    return response;
  })());
});
