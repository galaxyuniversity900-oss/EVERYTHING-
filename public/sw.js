const CACHE_NAME = "everything-shell-v1";
const SHELL_ASSETS = [
  "/", "/styles.css", "/ai.css", "/mcp.css", "/remote.css",
  "/app.js", "/ai.js", "/runtime.js", "/mcp.js", "/remote.js",
  "/manifest.webmanifest", "/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await Promise.all(SHELL_ASSETS.map(async (asset) => {
      try { await cache.add(asset); } catch { /* Keep installation resilient if one asset is temporarily unavailable. */ }
    }));
  }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("everything-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    if (url.pathname !== "/api/apps") return;
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(async () => (await caches.match(request)) || new Response(JSON.stringify({
      offline: true, count: 0, categories: ["All"], apps: []
    }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } })));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match("/")) || Response.error()));
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })));
  }
});
