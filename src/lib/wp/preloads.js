// src/lib/wp/preloads.js

/**
 * Generate carousel and slideshow preloads
 * Returns array matching your existing MainLayout format
 */
function inferImageMimeType(url) {
  if (!url) return undefined;

  const normalized = String(url).split("?")[0].toLowerCase();
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".png")) return "image/png";
  return undefined;
}

export function getPreloads(rows) {
  if (!rows || rows.length === 0) return [];

  const preloads = [];

  /* ───────────────────────────────────────────
     1. CAROUSEL
     Return as simple string URLs (your existing format)
  ─────────────────────────────────────────── */
  const carouselPreloads = rows
    .filter((r) => r.name === "carousel")
    .flatMap((r) => (r.data.images || []).slice(0, 3)) // 🔑 Only first 3 visible
    .map((item) => {
      const imgData = item.image || item || {};
      const targetUrl = imgData.sizes?.intch_med || imgData.url || imgData.src;
      return targetUrl || null;
    })
    .filter(Boolean);

  preloads.push(...carouselPreloads);

  /* ───────────────────────────────────────────
     2. FULL WIDTH SLIDESHOW
     Return as objects with srcset (your existing format)
  ─────────────────────────────────────────── */
  const slideshowPreloads = rows
    .filter((r) => r.name === "full_width_slideshow")
    .flatMap((r) => {
      const images = r.data.images || [];
      return images.slice(0, 3); // Keep the next few hero slides warm for the wipe transition
    })
    .map((item) => {
      const img = item.image || item || {};
      if (!img.url) return null;

      const sizes = img.sizes || {};
      const srcXL  = sizes.intch_xl  || img.url;
      const srcLG  = sizes.intch_lg  || img.url;
      const srcMED = sizes.intch_med || img.url;
      const srcSM  = sizes.intch_sm  || img.url;

      const imagesrcset = [
        srcXL  && `${srcXL} 2048w`,
        srcLG  && `${srcLG} 1600w`,
        srcMED && `${srcMED} 1200w`,
        srcSM  && `${srcSM} 800w`,
      ].filter(Boolean).join(", ");

      const href = srcXL || srcLG || srcMED || srcSM;
      const type = inferImageMimeType(href);

      return href
        ? {
            href,
            imagesrcset,
            imagesizes: "(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1400px",
            type,
          }
        : null;
    })
    .filter(Boolean);

  preloads.push(...slideshowPreloads);

  return preloads;
}
