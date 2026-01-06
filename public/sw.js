/* ==========================================================
   CONSTANTS
========================================================== */
const PREFETCH_CACHE = "prefetch-v1";

/* ==========================================================
   FETCH LISTENER (Serve Prefetched Assets)
========================================================== */
self.addEventListener("fetch", (event) => {
  // Try to find the request in the prefetch cache
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached response if found, otherwise fetch from network
      return cachedResponse || fetch(event.request);
    })
  );
});

/* ==========================================================
   SW LIFECYCLE
========================================================== */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Claim clients immediately so the first page load is controlled
  event.waitUntil(self.clients.claim());
  
  // Optional: Cleanup old caches (if you change versions later)
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
    prefetchList = event.data.prefetchAssets;
    prefetchAll();
  }
});

async function sendPrefetchRequest(clientId) {
  const client = await self.clients.get(clientId);
  if (!client) return;
  client.postMessage("request-prefetch-list");
}

/* ==========================================================
   HELPERS
========================================================== */
async function opaqueFetchAndCache(url) {
  try {
    // mode: 'no-cors' allows caching cross-origin images (opaque response)
    const req = new Request(url, { mode: "no-cors" });
    const res = await fetch(req);

    if (!res) return;

    const cache = await caches.open(PREFETCH_CACHE);
    await cache.put(url, res.clone());

    console.log("[SW] Prefetched:", url);
  } catch (err) {
    // Fallback or silence errors for failed prefetches
    console.warn("[SW] Prefetch failed:", url, err);
  }
}

/* ==========================================================
   PREFETCH SYSTEM
========================================================== */
let prefetchList = [];

async function prefetchAll() {
  if (!prefetchList || prefetchList.length === 0) return;

  // Simply loop through the list and cache everything provided
  for (const item of prefetchList) {
    if (item) {
      await opaqueFetchAndCache(item);
    }
  }
}