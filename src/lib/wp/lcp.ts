// src/lib/wp/lcp.ts
import type { NormRow } from "./normalize";

export function getLcpImage(rows: NormRow[]) {
  if (!rows || !rows.length) return null;

  const firstData = rows[0].data || {};
  let foundImg = null;

  // HERO VIDEO POSTER
  if (Array.isArray(firstData.video) && firstData.video[0]?.yt_img) {
    const raw = firstData.video[0].yt_img;
    const sizes = raw.sizes || {};

    const candidates = [
      { url: sizes.intch_xl || raw.url, w: sizes["intch_xl-width"] },
      { url: sizes.intch_lg, w: sizes["intch_lg-width"] },
      { url: sizes.intch_med, w: sizes["intch_med-width"] },
      { url: sizes.intch_sm, w: sizes["intch_sm-width"] }
    ].filter(c => c.url);

    const srcsetParts = candidates
      .filter(c => c.w)
      .map(c => `${c.url} ${c.w}w`);

    return {
      href: candidates[0].url,
      imagesrcset: srcsetParts.length ? srcsetParts.join(", ") : undefined,
      imagesizes: "(max-width: 1200px) 60vw, 100vw",
      type: "image/jpeg"
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
