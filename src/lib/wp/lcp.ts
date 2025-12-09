// src/lib/wp/lcp.ts
import type { NormRow } from "./normalize";

function appendWebp(url: string | undefined): string | undefined {
  if (!url) return url;

  // Already a .webp or already appended
  if (url.endsWith(".webp")) return url;
  if (url.endsWith(".jpg.webp") || url.endsWith(".png.webp")) return url;

  if (url.endsWith(".jpg") || url.endsWith(".png")) {
    return url + ".webp";
  }
  return url;
}


export function getLcpImage(rows: NormRow[]) {
  if (!rows || !rows.length) return null;

  const firstData = rows[0].data || {};

  // HERO VIDEO POSTER
  if (Array.isArray(firstData.video) && firstData.video[0]?.yt_img) {
    const raw = firstData.video[0].yt_img;
    const sizes = raw.sizes || {};

    const candidates = [
      { url: appendWebp(sizes.intch_xl || raw.url), w: sizes["intch_xl-width"] },
      { url: appendWebp(sizes.intch_lg),           w: sizes["intch_lg-width"] },
      { url: appendWebp(sizes.intch_med),          w: sizes["intch_med-width"] },
      { url: appendWebp(sizes.intch_sm),           w: sizes["intch_sm-width"] }
    ].filter(c => c.url);

    const srcsetParts = candidates
      .filter(c => c.w)
      .map(c => `${c.url} ${c.w}w`);

    return {
      href: candidates[0].url,
      imagesrcset: srcsetParts.length ? srcsetParts.join(", ") : undefined,
      imagesizes: "(max-width: 1200px) 60vw, 100vw",
      type: "image/webp"
    };
  }

  return null;
}

// NEW: Get Cloudflare video URL for preload
export function getLcpVideo(rows: NormRow[]) {
  if (!rows || !rows.length) return null;

  const firstData = rows[0].data || {};
  if (!firstData.video || !firstData.video[0]) return null;

  const v = firstData.video[0];

  if (v.cf_stream_video) {
    return {
      href: `${v.cf_stream_video}?clientBandwidthHint=1000`,
      type: "application/vnd.apple.mpegurl"
    };
  }
  return null;
}
