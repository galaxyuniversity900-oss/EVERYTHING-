const CACHE_NAME = "everything-shell-v6";
const AUTH_MODE_KEY = "/__everything_auth_mode__";
const SHELL_ASSETS = [
  "/", "/styles.css", "/auth.css", "/ai.css", "/mcp.css", "/remote.css",
  "/app.js", "/auth.js", "/ai.js", "/runtime.js", "/device-profile.js", "/mcp.js", "/remote.js", "/workspace.js", "/workspace-core.js", "/workspace.css",
  "/manifest.webmanifest", "/icon.svg"
];

async function storeAuthMode(required) {
  const cache = await caches.open(CACHE_NAME);
  const request = new Request(new URL(AUTH_MODE_KEY, self.location.origin));
  const response = new Response(JSON.stringify({ required: required === true }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
  await cache.put(request, response);
}

async function isAuthRequired(cache) {
  const marker = await cache.match(new URL(AUTH_MODE_KEY, self.location.origin).toString());
  if (!marker) return true; // Fail closed until the server has confirmed that auth is disabled.
  try { return JSON.parse(await marker.text()).required === true; }
  catch { return true; }
}

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

  if (url.pathname === "/api/auth/status") {
    event.respondWith(fetch(request, { cache: "no-store" }).then(async (response) => {
      if (response.ok) {
        try {
          const state = await response.clone().json();
          await storeAuthMode(state.required === true);
        } catch { await storeAuthMode(true); }
      }
      return response;
    }));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (url.pathname !== "/api/apps") return;
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response.status === 401) {
          await storeAuthMode(true);
          await cache.delete(request);
          return response;
        }
        if (response.ok) {
          if (await isAuthRequired(cache)) await cache.delete(request);
          else await cache.put(request, response.clone());
        }
        return response;
      } catch {
        if (await isAuthRequired(cache)) {
          return new Response(JSON.stringify({ error: { code: "authentication_required", message: "Connect to the server and sign in before accessing the catalog." } }), {
            status: 401, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
          });
        }
        return (await cache.match(request)) || new Response(JSON.stringify({
          offline: true, count: 0, categories: ["All"], apps: []
        }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
      }
    })());
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
