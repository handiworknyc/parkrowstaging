// src/lib/wp/preloads.js
import { toLocalCache } from "./lcp"; // Assuming toLocalCache is exported from here

export function getPreloads(rows) {
  if (!rows || rows.length === 0) return [];

  /* ───────────────────────────────────────────
     1. CAROUSEL
  ─────────────────────────────────────────── */
  const carouselPreloads = rows
    .filter((r) => r.name === "carousel")
    .flatMap((r) => r.data.images || [])
    .map((item) => {
      const imgData = item.image || item || {};
      const targetUrl = (imgData.sizes && imgData.sizes.intch_med) 
        ? imgData.sizes.intch_med 
        : (imgData.url || imgData.src);

      // Return object structure directly here
      const href = toLocalCache(targetUrl);
      return href ? { href } : null;
    })
    .filter(Boolean);

  /* ───────────────────────────────────────────
     2. FULL WIDTH SLIDESHOW
  ─────────────────────────────────────────── */
  const slideshowPreloads = rows
    .filter((r) => r.name === "full_width_slideshow")
    .flatMap((r) => r.data.images || [])
    .map((item) => {
      const img = item.image || item || {};
      if (!img.url) return null;

      const sizes = img.sizes || {};

      const srcXL  = sizes.intch_xl  || img.url;
      const srcLG  = sizes.intch_lg  || img.url;
      const srcMED = sizes.intch_med || img.url;
      const srcSM  = sizes.intch_sm  || img.url;

      const xl  = srcXL  ? toLocalCache(srcXL)  : null;
      const lg  = srcLG  ? toLocalCache(srcLG)  : null;
      const med = srcMED ? toLocalCache(srcMED) : null;
      const sm  = srcSM  ? toLocalCache(srcSM)  : null;

      const imagesrcset = [
        xl  && `${xl} 2048w`,
        lg  && `${lg} 1600w`,
        med && `${med} 1200w`,
        sm  && `${sm} 800w`,
      ].filter(Boolean).join(", ");

      const href = xl || lg || med || sm;

      return href
        ? {
            href,
            imagesrcset,
            imagesizes: "(max-width: 1200px) 100vw, 100vw",
            type: "image/webp",
          }
        : null;
    })
    .filter(Boolean);

  // Combine them into one simple array
  return [...carouselPreloads, ...slideshowPreloads];
}