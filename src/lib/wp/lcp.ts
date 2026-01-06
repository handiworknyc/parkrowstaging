import { createHash } from "node:crypto";
import path from "node:path";
import type { NormRow } from "./normalize";

/**
 * Transforms a WordPress URL into the local cached path.
 * * EXACT MATCH of sync-flex-rest.js logic:
 * 1. Check if already local
 * 2. Strip .webp if double extension
 * 3. Hash CLEANED URL
 * 4. Sanitize Filename
 * 5. Reconstruct: cleanName-hash.jpg.webp
 */
function toLocalCache(url: string | undefined): string | undefined {
  if (!url) return undefined;
  
  // ✅ 1. If already local (because sync-flex-rest ran first), return as is
  if (url.startsWith("/")) return url;

  try {
    let processUrl = url;

    // ✅ 2. STRIP .webp if it is a double extension (e.g. image.jpg.webp)
    if (processUrl.toLowerCase().endsWith('.webp')) {
      const withoutWebp = processUrl.slice(0, -5); 
      const extBefore = path.extname(withoutWebp);
      if (['.jpg', '.jpeg', '.png'].includes(extBefore.toLowerCase())) {
          processUrl = withoutWebp;
      }
    }

    // ✅ 3. Generate hash based on the CLEANED URL
    const hash = createHash("md5").update(processUrl).digest("hex").slice(0, 8);

    // 4. Extract parts from CLEANED URL
    // We use a dummy base because 'url' might be a relative path or just a string
    const urlObj = new URL(processUrl, "https://example.com"); 
    const pathname = urlObj.pathname; 
    const basename = path.basename(pathname);

    const ext = path.extname(basename); 
    const nameWithoutExt = path.basename(basename, ext); 

    // 5. Sanitize the name 
    const cleanName = nameWithoutExt.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();

    // ✅ 6. Handle WebP appending
    let finalExt = ext;
    if (['.jpg', '.jpeg', '.png'].includes(ext.toLowerCase())) {
        finalExt = `${ext}.webp`;
    }

    // 7. Construct final filename
    const filename = `${cleanName}-${hash}${finalExt}`;

    return `/img-cache/${filename}`;

  } catch (err) {
    console.warn("Could not convert to local cache path:", url);
    return undefined;
  }
}

export function getLcpImage(rows: NormRow[]) {
  if (!rows || !rows.length) return null;

  const firstData = rows[0].data || {};

  // HERO VIDEO POSTER
  if (Array.isArray(firstData.video) && firstData.video[0]?.yt_img) {
    const raw = firstData.video[0].yt_img;
    const sizes = raw.sizes || {};

    const candidates = [
      { url: toLocalCache(sizes.intch_xl || raw.url), w: sizes["intch_xl-width"] },
      { url: toLocalCache(sizes.intch_lg),            w: sizes["intch_lg-width"] },
      { url: toLocalCache(sizes.intch_med),           w: sizes["intch_med-width"] },
      { url: toLocalCache(sizes.intch_sm),            w: sizes["intch_sm-width"] }
    ].filter(c => c.url && c.w);

    if (!candidates.length) return null;

    const srcsetParts = candidates.map(c => `${c.url} ${c.w}w`);

    return {
      href: candidates[0].url as string,
      imagesrcset: srcsetParts.join(", "),
      imagesizes: "(max-width: 1200px) 60vw, 100vw",
      type: "image/webp"
    };
  }

  return null;
}

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