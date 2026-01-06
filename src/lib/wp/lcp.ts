import { createHash } from "node:crypto";
import path from "node:path";
import type { NormRow } from "./normalize";

/**
 * Transforms a WordPress URL into the local cached path.
 * * EXACT MATCH of SmartImage.astro logic:
 * 1. MD5 Hash (8 chars)
 * 2. Parse URL & Path
 * 3. Sanitize Filename (lowercase, remove special chars)
 * 4. Reconstruct: cleanName-hash.ext.webp
 */
function toLocalCache(url: string | undefined): string | undefined {
  if (!url) return undefined;

  try {
    // 1. Generate a short hash based on the unique URL
    const hash = createHash("md5").update(url).digest("hex").slice(0, 8);

    // 2. Extract the original filename
    // We use a dummy base because 'url' might be a relative path or just a string
    const urlObj = new URL(url, "https://example.com"); 
    const pathname = urlObj.pathname; // e.g. "/wp-content/uploads/2024/01/My Image.jpg"
    const basename = path.basename(pathname); // "My Image.jpg"

    // 3. Remove extension from basename to clean it up
    const ext = path.extname(basename); // ".jpg"
    const nameWithoutExt = path.basename(basename, ext); // "My Image"

    // 4. Sanitize the name (Exact match to SmartImage logic)
    const cleanName = nameWithoutExt.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();

    // 5. Construct final filename
    // Note: SmartImage usually saves the file as [original-name]-[hash].[ext].webp
    const filename = `${cleanName}-${hash}${ext}.webp`;

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