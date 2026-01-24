/* ==========================================================
   CONFIGURATION
========================================================== */
const CONFIG = {
  CACHE_VERSION: "prefetch-v1",
  DEBUG: false,
  PREFETCH_CONCURRENCY: 3, // Parallel requests to avoid bandwidth saturation
  FETCH_TIMEOUT: 10000, // 10s timeout for prefetch requests
  MAX_CACHE_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

const log = (...args) => CONFIG.DEBUG && console.log("[SW]", ...args);
const warn = (...args) => console.warn("[SW]", ...args);

/* ==========================================================
   FETCH HANDLER (Stale-While-Revalidate Strategy)
========================================================== */
self.addEventListener("fetch", (event) => {
  // Only handle GET requests for cacheable resources
  if (event.request.method !== "GET") return;

  // Don't cache API calls, auth endpoints, or chrome extensions
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("auth") ||
    url.protocol === "chrome-extension:"
  ) {
    return;
  }

  event.respondWith(handleFetch(event.request));
});

async function handleFetch(request) {
  const cache = await caches.open(CONFIG.CACHE_VERSION);

  // Try cache first
  const cachedResponse = await cache.match(request);

  // Stale-while-revalidate: return cache immediately, update in background
  if (cachedResponse) {
    // Fire-and-forget network update
    fetchAndCache(request, cache).catch(() => {
      // Silent failure - we already have cached version
    });

    return cachedResponse;
  }

  // No cache - fetch from network
  try {
    const networkResponse = await fetch(request);

    // Cache successful responses (200-299)
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (err) {
    warn("Network fetch failed:", request.url, err);

    // Return cached version if available (defensive fallback)
    const fallback = await cache.match(request);
    if (fallback) return fallback;

    // No cache, no network - throw
    throw err;
  }
}

async function fetchAndCache(request, cache) {
  const response = await fetch(request);

  if (response.ok) {
    await cache.put(request, response.clone());
    log("Updated cache:", request.url);
  }

  return response;
}

/* ==========================================================
   LIFECYCLE EVENTS
========================================================== */
self.addEventListener("install", (event) => {
  log("Installing service worker");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  log("Activating service worker");

  event.waitUntil(
    Promise.all([
      // Take control of all clients immediately
      self.clients.claim(),

      // Cleanup old caches
      cleanupOldCaches(),

      // Prune expired entries from current cache
      pruneExpiredEntries(),
    ])
  );
});

async function cleanupOldCaches() {
  const keys = await caches.keys();
  const oldCaches = keys.filter((key) => key !== CONFIG.CACHE_VERSION);

  log("Cleaning up old caches:", oldCaches);

  await Promise.all(oldCaches.map((key) => caches.delete(key)));
}

async function pruneExpiredEntries() {
  const cache = await caches.open(CONFIG.CACHE_VERSION);
  const requests = await cache.keys();
  const now = Date.now();

  log(`Pruning ${requests.length} cached entries...`);

  let pruned = 0;

  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;

    const dateHeader = response.headers.get("date");
    if (!dateHeader) continue;

    const age = now - new Date(dateHeader).getTime();

    if (age > CONFIG.MAX_CACHE_AGE) {
      await cache.delete(request);
      pruned++;
    }
  }

  log(`Pruned ${pruned} expired entries`);
}

/* ==========================================================
   MESSAGE HANDLERS
========================================================== */
self.addEventListener("message", async (event) => {
  const { data, source } = event;

  if (data === "prefetch") {
    await handlePrefetchRequest(source.id);
  } else if (data?.prefetchAssets) {
    await handlePrefetchAssets(data.prefetchAssets);
  } else {
    warn("Unknown message:", data);
  }
});

async function handlePrefetchRequest(clientId) {
  const client = await self.clients.get(clientId);

  if (!client) {
    warn("Client not found:", clientId);
    return;
  }

  log("Requesting prefetch list from client:", clientId);
  client.postMessage("request-prefetch-list");
}

async function handlePrefetchAssets(assets) {
  if (!Array.isArray(assets) || assets.length === 0) {
    warn("Invalid or empty prefetch list");
    return;
  }

  log(`Prefetching ${assets.length} assets with concurrency ${CONFIG.PREFETCH_CONCURRENCY}`);

  // Process in batches to avoid network congestion
  await processBatches(assets, CONFIG.PREFETCH_CONCURRENCY, prefetchAsset);

  log("Prefetch complete");
}

/* ==========================================================
   PREFETCH LOGIC
========================================================== */
async function prefetchAsset(url) {
  try {
    const cache = await caches.open(CONFIG.CACHE_VERSION);

    // Skip if already cached
    const existing = await cache.match(url);
    if (existing) {
      log("Already cached:", url);
      return;
    }

    // Fetch with timeout
    const response = await fetchWithTimeout(url, CONFIG.FETCH_TIMEOUT);

    if (response) {
      await cache.put(url, response.clone());
      log("Cached:", url);
    }
  } catch (err) {
    warn("Prefetch failed:", url, err.message);
  }
}

async function fetchWithTimeout(url, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // mode: 'no-cors' handles external CDNs without CORS headers
    const response = await fetch(new Request(url, { 
      mode: "no-cors",
      signal: controller.signal,
    }));

    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);

    // Don't log aborts as errors - they're expected
    if (err.name === "AbortError") {
      warn("Fetch timeout:", url);
    }

    throw err;
  }
}

/* ==========================================================
   UTILITIES
========================================================== */
async function processBatches(items, concurrency, handler) {
  const results = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((item) => handler(item))
    );

    results.push(...batchResults);
  }

  return results;
}