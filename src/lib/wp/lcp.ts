import type { NormRow } from "./normalize";

/**
 * Responsive sizes optimized for hero video posters
 */
function getResponsiveSizes(): string {
  return [
    '(max-width: 640px) 100vw',
    '(max-width: 1024px) 90vw',
    '(max-width: 1440px) 80vw',
    '1400px'
  ].join(', ');
}

/**
 * Get LCP image data for hero video poster
 */
export function getLcpImage(rows: NormRow[]) {
  if (!rows || !rows.length) return null;

  const firstData = rows[0].data || {};

  if (Array.isArray(firstData.video) && firstData.video[0]?.yt_img) {
    const raw = firstData.video[0].yt_img;
    const sizes = raw.sizes || {};

    const candidates = [
      { url: sizes.intch_xl || raw.url, w: sizes["intch_xl-width"] || 2048 },
      { url: sizes.intch_lg,            w: sizes["intch_lg-width"] || 1600 },
      { url: sizes.intch_med,           w: sizes["intch_med-width"] || 1200 },
      { url: sizes.intch_sm,            w: sizes["intch_sm-width"] || 800 }
    ].filter(c => c.url);

    if (!candidates.length) return null;

    const srcsetParts = candidates.map(c => `${c.url} ${c.w}w`);

    return {
      href: candidates[0].url as string,
      imagesrcset: srcsetParts.join(", "),
      imagesizes: getResponsiveSizes(),
      type: "image/webp"
    };
  }

  return null;
}

/**
 * Get LCP video data for hero video
 * Returns object matching your MainLayout lcpVideo prop
 */
export function getLcpVideo(rows: NormRow[]) {
  if (!rows || !rows.length) return null;

  const firstData = rows[0].data || {};
  if (!firstData.video || !firstData.video[0]) return null;

  const v = firstData.video[0];

  if (v.cf_stream_video) {
    return {
      href: v.cf_stream_video
    };
  }
  
  return null;
}
