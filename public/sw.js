/* ==========================================================
   CONSTANTS
========================================================== */
const PREFETCH_CACHE = "prefetch-v1";

/* ==========================================================
   FETCH LISTENER (Serve Prefetched Assets)
========================================================== */
self.addEventListener("fetch", (event) => {
  // 1. Only handle GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    (async () => {
      // 2. Try to match in the prefetch cache first
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      // 3. Fallback to network
      return fetch(event.request);
    })()
  );
});

/* ==========================================================
   SW LIFECYCLE
========================================================== */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
  
  // Cleanup old caches if version changes
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== PREFETCH_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
});

/* ==========================================================
   MESSAGE HANDLERS
========================================================== */
self.addEventListener("message", (event) => {
  if (event.data === "prefetch") {
    sendPrefetchRequest(event.source.id);
  }

  if (event.data?.prefetchAssets) {
    // Receive array of specific URLs to cache
    prefetchAll(event.data.prefetchAssets);
  }
});

async function sendPrefetchRequest(clientId) {
  const client = await self.clients.get(clientId);
  if (!client) return;
  client.postMessage("request-prefetch-list");
}

/* ==========================================================
   HELPERS & PREFETCH LOGIC
========================================================== */
async function opaqueFetchAndCache(url) {
  try {
    // Open cache first to check if we already have it (save bandwidth)
    const cache = await caches.open(PREFETCH_CACHE);
    const existing = await cache.match(url);
    if (existing) return;

    // mode: 'no-cors' handles external CDNs/S3 without CORS headers
    // This creates an "opaque" response (status 0)
    const req = new Request(url, { mode: "no-cors" });
    const res = await fetch(req);

    if (res) {
      await cache.put(url, res.clone());
      console.log("[SW] Cached:", url);
    }
  } catch (err) {
    console.warn("[SW] Failed:", url, err);
  }
}

async function prefetchAll(list) {
  if (!list || !Array.isArray(list) || list.length === 0) return;

  // Process sequentially to avoid nuking network bandwidth
  // or use Promise.all for parallel if list is small
  for (const item of list) {
    if (item && typeof item === "string") {
      await opaqueFetchAndCache(item);
    }
  }
}