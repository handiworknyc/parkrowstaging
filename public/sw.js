/* ==========================================================
   CONSTANTS
========================================================== */
const MP4_CACHE = "videos-mp4";
const PREFETCH_CACHE = "prefetch-v1";

/* ==========================================================
   PRIVATE MODE DETECTION
========================================================== */
async function isPrivateMode() {
  return new Promise((resolve) => {
    const db = indexedDB.open("sw-private-check");
    db.onerror = () => resolve(true);
    db.onsuccess = () => resolve(false);
  });
}

/* ==========================================================
   STREAM MP4 WITH BYTE-RANGE SUPPORT
========================================================== */

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  const isLocalMp4 =
    url.pathname.startsWith("/videos/") &&
    url.pathname.match(/\.mp4($|\?)/);

  if (isLocalMp4) {
    console.log("[SW] FETCH MP4:", url.pathname);
    event.respondWith(streamMp4(event.request, url.pathname));
    return;
  }
});

async function streamMp4(request, pathname) {
  /* 🔒 DO NOT use cache in private mode */
  if (await isPrivateMode()) {
    console.warn("[SW] Private mode → MP4 cache disabled:", pathname);
    return fetch(request);
  }

  const cache = await caches.open(MP4_CACHE);
  const cached = await cache.match(pathname);

  if (!cached) {
    console.warn("[SW] MP4 not cached → falling back to network:", pathname);
    return fetch(request);
  }

  // If placeholder (0 bytes), skip (prevents MEDIA_ERR_SRC_NOT_SUPPORTED)
  const buffer = await cached.arrayBuffer();
  const total = buffer.byteLength;

  if (total === 0) {
    console.warn("[SW] Placeholder MP4 detected → network fallback:", pathname);
    return fetch(request);
  }

  const range = request.headers.get("Range");

  if (!range) {
    console.log("[SW] Serving full MP4:", pathname);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": total,
        "Accept-Ranges": "bytes",
      },
    });
  }

  const match = /bytes=(\d+)-(\d+)?/.exec(range);
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : total - 1;
  const chunk = buffer.slice(start, end + 1);

  console.log(`[SW] Serving MP4 chunk: ${start}-${end} / ${total}`);

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

/* ==========================================================
   SW LIFECYCLE
========================================================== */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
    const req = new Request(url, { mode: "no-cors" });
    const res = await fetch(req);

    if (!res) return;

    const cache = await caches.open(PREFETCH_CACHE);
    await cache.put(url, res.clone());

    console.log("[SW] Prefetched (opaque):", url);
  } catch (err) {
    console.warn("[SW] Opaque prefetch failed:", url, err);
  }
}

/**
 * Mark a local MP4 as “cached”
 * Used ONLY in normal mode.
 */
async function markLocalMp4Cached(path) {
  try {
    if (await isPrivateMode()) {
      console.warn("[SW] Private mode → skip MP4 mark:", path);
      return;
    }

    const cache = await caches.open(MP4_CACHE);

    // Placeholder (0 bytes). We now detect this during playback.
    const placeholder = new Response("", {
      status: 200,
      headers: { "Content-Type": "video/mp4" }
    });

    await cache.put(path, placeholder);

    console.log("[SW] Marked MP4 as cached:", path);
  } catch (err) {
    console.warn("[SW] Failed to mark MP4 cached:", path, err);
  }
}

/* ==========================================================
   PREFETCH SYSTEM
========================================================== */

let prefetchList = [];

async function prefetchAll() {
  if (!prefetchList || prefetchList.length === 0) return;

  const privateMode = await isPrivateMode();

  /* 🚫 In private browsing: NO video prefetching AT ALL */
  if (privateMode) {
    console.warn("[SW] Private mode → disabling all video prefetch");
    for (const item of prefetchList) {
      if (!item.includes("cloudflarestream.com")) {
        opaqueFetchAndCache(item);
      }
    }
    return;
  }

  const mp4Cache = await caches.open(MP4_CACHE);

  for (const item of prefetchList) {
    if (!item) continue;

    const isManifest = item.includes("/manifest/video.m3u8");

    if (!isManifest) {
      opaqueFetchAndCache(item);
      continue;
    }

    const match = item.match(/com\/([^/]+)\//);

    if (!match) {
      opaqueFetchAndCache(item);
      continue;
    }

    const cfId = match[1];
    const localMp4 = `/videos/${cfId}.mp4`;

    await markLocalMp4Cached(localMp4);

    console.log("[SW] Skipping manifest prefetch — local MP4 exists:", localMp4);
  }
}
