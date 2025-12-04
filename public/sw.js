/* ==========================================================
   SERVICE WORKER — OPAQUE PREFETCH MODE
   - Eliminates ALL CORS console errors
   - Prefetches remote WP Engine images safely
   - Prefetches Cloudflare Stream manifests safely
   - Stores opaque responses in CacheStorage
   - Never blocks the page
========================================================== */

const CACHE_NAME = "prefetch-v1";

// List of assets passed from your page via postMessage('prefetch')
let prefetchList = [];

// Listen for activation
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/* ==========================================================
   SAFE OPAQUE PREFETCH HELPER
========================================================== */
async function opaqueFetchAndCache(url) {
  try {
    // Opaque request — NO-CORS → NO CORS ERRORS
    const response = await fetch(url, { mode: "no-cors" });

    const cache = await caches.open(CACHE_NAME);
    await cache.put(url, response.clone());

    console.log("[SW] Prefetched (opaque cached):", url);
  } catch (err) {
    console.warn("[SW] Prefetch failed:", url, err);
  }
}

/* ==========================================================
  MESSAGES FROM MAIN THREAD (prefetch trigger)
========================================================== */
self.addEventListener("message", (event) => {
  if (event.data === "prefetch") {
    // Client will send asset map back
    sendPrefetchRequest(event.source.id);
  }

  if (event.data.prefetchAssets) {
    prefetchList = event.data.prefetchAssets;
    prefetchAll();
  }
});

/* ==========================================================
   REQUEST THE ASSET LIST FROM THE PAGE
========================================================== */
async function sendPrefetchRequest(clientId) {
  const client = await self.clients.get(clientId);
  if (!client) return;

  client.postMessage("request-prefetch-list");
}

/* ==========================================================
   PREFETCH ALL RESOURCES (Cloudflare + WP images)
========================================================== */
async function prefetchAll() {
  if (!prefetchList || prefetchList.length === 0) return;

  for (const item of prefetchList) {
    if (!item) continue;

    // Just fetch blindly — opaque mode handles all remote assets
    opaqueFetchAndCache(item);
  }
}
