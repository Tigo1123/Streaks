const CACHE_NAME = "streaks-shell-v8";
const CACHE_PREFIX = "streaks-shell-";
const scopeUrl = new URL(self.registration.scope);
const indexUrl = new URL("index.html", scopeUrl);
const shellUrls = [
  scopeUrl.href,
  indexUrl.href,
  new URL("manifest.webmanifest", scopeUrl).href,
  new URL("icons/icon-192.png", scopeUrl).href,
  new URL("icons/icon-512.png", scopeUrl).href,
  new URL("icons/apple-touch-icon.png", scopeUrl).href,
  new URL("fonts/manrope-latin.woff2", scopeUrl).href,
  new URL("fonts/tajawal-arabic-regular.woff2", scopeUrl).href,
  new URL("fonts/tajawal-latin-regular.woff2", scopeUrl).href,
  new URL("fonts/tajawal-arabic-bold.woff2", scopeUrl).href,
  new URL("fonts/tajawal-latin-bold.woff2", scopeUrl).href
];
const shellPaths = new Set(shellUrls.map((url) => new URL(url).pathname));
const assetsPath = new URL("assets/", scopeUrl).pathname;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const indexResponse = await fetch(new Request(indexUrl, { cache: "reload" }));
    if (!indexResponse.ok) throw new Error(`Could not cache app shell: ${indexResponse.status}`);

    const html = await indexResponse.clone().text();
    const assetUrls = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)]
      .map((match) => new URL(match[1], scopeUrl))
      .filter((url) => url.origin === scopeUrl.origin && url.pathname.startsWith(assetsPath))
      .map((url) => url.href);

    await cache.addAll([...new Set([...shellUrls.slice(2), ...assetUrls])]);
    await cache.put(indexUrl.href, indexResponse.clone());
    await cache.put(scopeUrl.href, indexResponse.clone());
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    /streaks-api/i.test(url.hostname) ||
    url.hostname === "accounts.google.com" ||
    url.hostname.endsWith(".google.com") ||
    url.origin !== scopeUrl.origin
  ) {
    return;
  }

  const isNavigation = request.mode === "navigate";
  const isAppAsset = shellPaths.has(url.pathname) || url.pathname.startsWith(assetsPath);
  if (!isNavigation && !isAppAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (!isNavigation) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }

    try {
      const response = await fetch(request);
      if (response.ok && isAppAsset) await cache.put(request, response.clone());
      if (isNavigation && response.ok) {
        await cache.put(indexUrl.href, response.clone());
        await cache.put(scopeUrl.href, response.clone());
      }
      return response;
    } catch (error) {
      if (isNavigation) {
        const cached = await cache.match(url.href)
          || await cache.match(indexUrl.href)
          || await cache.match(scopeUrl.href);
        if (cached) return cached;
      }
      throw error;
    }
  })());
});
