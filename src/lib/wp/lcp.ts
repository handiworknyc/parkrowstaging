// src/lib/wp/lcp.ts
import type { NormRow } from "./normalize";

export function getLcpImage(rows: NormRow[]) {
  if (!rows || rows.length === 0) return null;

  const firstData = rows[0].data || {};
  let foundImg = null;

  // 1. Video/Hero Check
  if (Array.isArray(firstData.video) && firstData.video[0]?.yt_img) {
    const raw = firstData.video[0].yt_img;
    const sizes = raw.sizes || {};
    
    const candidates = [
      { url: sizes.intch_xl || raw.url, w: sizes['intch_xl-width'] },
      { url: sizes.intch_lg, w: sizes['intch_lg-width'] },
      { url: sizes.intch_med, w: sizes['intch_med-width'] },
      { url: sizes.intch_sm, w: sizes['intch_sm-width'] }
    ].filter(c => c.url);

    const srcsetParts = candidates.filter(c => c.w).map(c => `${c.url} ${c.w}w`);

    foundImg = {
      href: sizes.intch_xl || raw.url,
      imagesrcset: srcsetParts.length > 0 ? srcsetParts.join(", ") : undefined,
      imagesizes: "(max-width: 1200px) 60vw, 100vw" 
    };
  } 
  // 2. Standard Image Check
  else {
    const imageKeys = ["image", "hero_image", "background_image", "bg_image", "mobile_image", "desktop_image"];
    for (const key of imageKeys) {
      if (firstData[key] && typeof firstData[key] === 'object') {
        const img = firstData[key];
        foundImg = {
            href: img.url || img.sourceUrl || img.src,
            imagesrcset: img.srcset || img.srcSet || undefined,
            imagesizes: "100vw"
        };
        break;
      }
    }
  }

  return foundImg;
}



// NEW: Get Cloudflare video URL for preload
export function getLcpVideo(rows: NormRow[]) {
  if (!rows || rows.length === 0) return null;

  const firstData = rows[0].data || {};

  if (Array.isArray(firstData.video) && firstData.video.length > 0) {
    const v = firstData.video[0];
    if (v.cf_stream_video) {
      // Return PRELOAD-READY URL
      return {
        href: `${v.cf_stream_video}?clientBandwidthHint=1000`,
      };
    }
  }

  return null;
}