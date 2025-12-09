/* ============================================================================
   SERVICE WORKER — FINAL VERSION
   Local MP4 streamer + Opaque Prefetch
   NO Cloudflare MP4 download allowed at runtime
============================================================================ */

/* ----------------------------------------------------------
   LOCAL MP4 CACHE
---------------------------------------------------------- */
const MP4_CACHE = "videos-mp4";

/* ----------------------------------------------------------
   FETCH INTERCEPTOR FOR LOCAL MP4 STREAMING
---------------------------------------------------------- */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle SERVING of local mirrored MP4 files
  if (url.pathname.startsWith("/videos/") && url.pathname.endsWith(".mp4")) {
    console.log("[SW] Intercept local MP4:", event.request.url);
    event.respondWith(streamLocalMp4(event.request));
    return;
  }
});

/* ----------------------------------------------------------
   Stream local MP4 from CacheStorage with byte-range support
---------------------------------------------------------- */
async function streamLocalMp4(request) {
  const cache = await caches.open(MP4_CACHE);
  const cached = await cache.match(request.url);

  if (!cached) {
    console.warn("[SW] Local MP4 not in cache → fallback to network:", request.url);
    return fetch(request);
  }

  const buffer = await cached.arrayBuffer();
  const total = buffer.byteLength;

  const range = request.headers.get("Range");
  if (!range) {
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": total,
        "Accept-Ranges": "bytes",
      },
    });
  }

  // Parse bytes
  const match = /bytes=(\d+)-(\d+)?/.exec(range);
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : total - 1;

  const chunk = buffer.slice(start, end + 1);

  console.log(
    `[SW] Serving MP4 chunk ${start}-${end} of ${total} bytes → ${request.url}`
  );

  return new Response(chunk, {
    status: 206,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": chunk.byteLength,
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes",
    },
  });
}

/* ============================================================================
   IMPORTANT:
   Cloudflare MP4 download logic is completely removed.
   The SW NEVER fetches Cloudflare MP4 URLs.
   Only LOCAL MP4s in /videos/*.mp4 are served.
============================================================================ */


/* ============================================================================
   OPAQUE PREFETCH SYSTEM (unchanged)
============================================================================ */

const CACHE_NAME = "prefetch-v1";
let prefetchList = [];

/* ----------------------------------------------------------
   Install & Activate
---------------------------------------------------------- */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/* ----------------------------------------------------------
   Safe opaque prefetch helper
---------------------------------------------------------- */
async function opaqueFetchAndCache(url) {
  try {
    const response = await fetch(url, { mode: "no-cors" });
    const cache = await caches.open(CACHE_NAME);
    await cache.put(url, response.clone());
    console.log("[SW] Prefetched (opaque cached):", url);
  } catch (err) {
    console.warn("[SW] Prefetch failed:", url, err);
  }
}

/* ----------------------------------------------------------
   Messaging from client
---------------------------------------------------------- */
self.addEventListener("message", (event) => {
  if (event.data === "prefetch") {
    sendPrefetchRequest(event.source.id);
  }

  if (event.data?.prefetchAssets) {
    prefetchList = event.data.prefetchAssets;
    prefetchAll();
  }
});

/* ----------------------------------------------------------
   Ask client for list of assets to prefetch
---------------------------------------------------------- */
async function sendPrefetchRequest(clientId) {
  const client = await self.clients.get(clientId);
  if (!client) return;
  client.postMessage("request-prefetch-list");
}

/* ----------------------------------------------------------
   Prefetch all assets
---------------------------------------------------------- */
async function prefetchAll() {
  if (!Array.isArray(prefetchList) || prefetchList.length === 0) return;

  for (const url of prefetchList) {
    if (!url) continue;
    opaqueFetchAndCache(url);
  }
}

/* ============================================================================
   END OF FILE — FINAL PRODUCTION VERSION
============================================================================ */
