const CACHE_NAME = "prefetch-cache-v1";
const LATEST_MAP = "/prefetch-map-latest.json";

// Resolve hash → actual filename
async function resolveMapFile() {
  try {
    const res = await fetch(LATEST_MAP, { cache: "no-cache" });
    if (!res.ok) return null;

    const { file } = await res.json();
    return "/" + file;
  } catch {
    return null;
  }
}

async function prefetchAssets() {
  const mapFile = await resolveMapFile();
  if (!mapFile) {
    console.warn("[SW] Could not resolve map file.");
    return;
  }

  try {
    const res = await fetch(mapFile, { cache: "no-cache" });
    if (!res.ok) {
      console.warn("[SW] Failed to fetch", mapFile);
      return;
    }

    const assetMap = await res.json();
    const cache = await caches.open(CACHE_NAME);

    for (const entry of assetMap) {
      // VIDEO
      if (entry.video) {
        try {
          await cache.add(entry.video);
          console.log("[SW] Prefetched video:", entry.video);
        } catch (e) {}
      }

      // LCP IMAGE
      if (entry.lcp?.href) {
        try {
          await cache.add(entry.lcp.href);
          console.log("[SW] Prefetched LCP:", entry.lcp.href);
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn("[SW] Prefetch failed:", err);
  }
}

// SW receives "prefetch" command after activation
self.addEventListener("message", (event) => {
  if (event.data === "prefetch") prefetchAssets();
});

// Cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      for (const key of keys) {
        if (key !== CACHE_NAME) {
          await caches.delete(key);
        }
      }
      await clients.claim();
    })()
  );
});

// Serve cached video/image assets
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  if (url.includes(".m3u8") || url.match(/\.(jpg|jpeg|png|webp|avif)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
