// src/scripts/sync-flex-rest.js
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "crypto";

function hashJSON(data) {
  return crypto.createHash("sha1").update(JSON.stringify(data)).digest("hex").slice(0, 12);
}

/* -------------------------------------------
   Load env files only when running locally
   (Netlify sets process.env.NETLIFY=true)
------------------------------------------- */
if (!process.env.NETLIFY) {
  try {
    const { config } = await import("dotenv");
    const mode = process.env.NODE_ENV === "production" ? "production" : "development";
    config({ path: `.env.${mode}` });
    config();
  } catch {
    // dotenv is optional
  }
}

/* -------------------------------------------
   Env + helpers
------------------------------------------- */
function maskBasicAuthUrl(u) {
  try {
    const url = new URL(u);
    if (url.username || url.password) {
      url.username = "***";
      url.password = "***";
    }
    return url.toString();
  } catch {
    return u;
  }
}

const WP_BASE = (process.env.WP_BASE_URL || "").trim();
const GRAPHQL = (process.env.WORDPRESS_API_URL || process.env.WP_GRAPHQL_URL || "").trim();
const PAGE_URIS_ENV = (process.env.PAGE_URIS || "").trim();
const AUTH = process.env.WP_AUTH_BASIC
  ? "Basic " + Buffer.from(process.env.WP_AUTH_BASIC, "utf8").toString("base64")
  : null;

if (!WP_BASE) {
  console.error("Missing WP_BASE_URL.");
  process.exit(1);
}

function authHeaders() {
  return AUTH ? { Authorization: AUTH } : {};
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { headers: { ...authHeaders() }, ...opts });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${url}\n${text.slice(0, 400)}`);
  }
  return { json: await res.json(), res };
}

function toPathname(link) {
  try {
    if (link && link.startsWith("http")) {
      const u = new URL(link);
      link = u.pathname;
    }
    if (!link.endsWith("/")) link += "/";
    if (!link.startsWith("/")) link = "/" + link;
    return link;
  } catch {
    return "/";
  }
}

function fileSlugFromUri(uri) {
  return uri.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "_") || "home";
}

/* -------------------------------------------
   Discovery
------------------------------------------- */
async function discoverPagesViaREST() {
  const pages = [];
  let page = 1;
  while (true) {
    const url = new URL("/wp-json/wp/v2/pages", WP_BASE);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    const { json, res } = await fetchJSON(url);
    if (!Array.isArray(json) || !json.length) break;
    pages.push(...json.map((p) => toPathname(p.link)));
    const totalPages = Number(res.headers.get("X-WP-TotalPages") || "1");
    if (page >= totalPages) break;
    page++;
  }
  return Array.from(new Set(pages));
}

async function discoverPagesViaGraphQL() {
  if (!GRAPHQL) return [];
  const q = `query URIs { pages(first: 500, where: { status: PUBLISH }) { nodes { uri } } }`;
  try {
    const res = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ query: q }),
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    const pageUris = (json?.data?.pages?.nodes || []).map((n) => n?.uri).filter(Boolean);
    return Array.from(new Set(pageUris));
  } catch {
    return [];
  }
}

async function fetchFlexibleForPage(uri) {
  const url = new URL("/wp-json/astro/v1/flexible", WP_BASE);
  url.searchParams.set("uri", uri);
  const { json } = await fetchJSON(url);
  return json;
}

/* -------------------------------------------
   Helper: Extract LCP Image Data (src, srcset, sizes)
------------------------------------------- */
function getRawLcpImage(row) {
  if (!row) return null;

  let imgObj = null;
  let defaultSizes = "100vw";

  // 1. Check Video Poster (yt_img)
  const videoField = row.video || (row.data && row.data.video);
  if (Array.isArray(videoField) && videoField[0]?.yt_img) {
    const raw = videoField[0].yt_img;
    const s = raw.sizes || {};
    
    // Build array of available sizes from ACF
    // Note: WordPress API often provides sizes as flat keys or an object. 
    // We try to reconstruct a useful srcset manually if WP didn't provide one pre-built.
    const candidates = [
      { url: s.intch_xl || raw.url, w: s['intch_xl-width'] },
      { url: s.intch_lg, w: s['intch_lg-width'] },
      { url: s.intch_med, w: s['intch_med-width'] },
      { url: s.intch_sm, w: s['intch_sm-width'] }
    ].filter(c => c.url && c.w); // Must have URL and Width

    const srcSetString = candidates.map(c => `${c.url} ${c.w}w`).join(", ");
    
    return {
      href: s.intch_xl || raw.url,
      imagesrcset: srcSetString || undefined,
      imagesizes: "(max-width: 1200px) 60vw, 100vw"
    };
  }

  // 2. Check Standard Images
  const imageKeys = ["image", "hero_image", "background_image", "bg_image", "mobile_image", "desktop_image"];
  const dataSource = row.data || row; 
  
  for (const key of imageKeys) {
    if (dataSource[key] && typeof dataSource[key] === 'object') {
      const img = dataSource[key];
      // WP REST API usually gives `srcset` directly for image fields
      return {
        href: img.url || img.sourceUrl || img.src,
        imagesrcset: img.srcset || img.srcSet || undefined,
        imagesizes: "100vw"
      };
    }
  }

  return null;
}

/* -------------------------------------------
   Main
------------------------------------------- */
async function run() {
  console.log("ENV:", { WP_BASE_URL: maskBasicAuthUrl(WP_BASE) });

  const outPages = path.join(process.cwd(), "src", "content", "wp", "pages");
  const publicDir = path.join(process.cwd(), "public");
  
  fs.mkdirSync(outPages, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  let pageUris = PAGE_URIS_ENV
    ? PAGE_URIS_ENV.split(",").map((s) => s.trim()).filter(Boolean)
    : await discoverPagesViaREST().catch(() => []);

  if (!pageUris.length) {
    const fb = await discoverPagesViaGraphQL();
    if (fb.length) pageUris = fb;
  }

  console.log(`🔎 Pages discovered: ${pageUris.length}`);
  if (!pageUris.length) return;

  let wrote = 0, skipped = 0, failed = 0;
  
  // Stores { path, video, lcp: { href, imagesrcset, imagesizes } }
  const prefetchMap = [];

  for (const uri of pageUris) {
    try {
      const data = await fetchFlexibleForPage(uri);
      const layouts = Array.isArray(data?.layouts) ? data.layouts : [];
      if (!layouts.length) {
        skipped++;
        continue;
      }

      const firstRow = layouts[0];
      const cleanPath = toPathname(uri);
      const entry = { path: cleanPath };
      let hasEntry = false;

      // 1. EXTRACT VIDEO
      const videoField = firstRow.video || (firstRow.data && firstRow.data.video);
      if (videoField && Array.isArray(videoField)) {
        const videoObj = videoField[0];
        if (videoObj && videoObj.cf_stream_video) {
           entry.video = videoObj.cf_stream_video;
           hasEntry = true;
        }
      }

      // 2. EXTRACT LCP IMAGE DATA
      const lcpData = getRawLcpImage(firstRow);
      if (lcpData) {
        entry.lcp = lcpData; // Store the whole object {href, imagesrcset, imagesizes}
        hasEntry = true;
      }

      if (hasEntry) {
        prefetchMap.push(entry);
      }

      const file = path.join(outPages, `${fileSlugFromUri(uri)}.json`);
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      console.log(`✅ Wrote ${file}`);
      wrote++;
    } catch (e) {
      console.error(`❌ Page ${uri}:`, e.message || e);
      failed++;
    }
  }

  
// Generate hashed filename
const hash = hashJSON(prefetchMap);
const mapFilename = `prefetch-map.${hash}.json`;
const mapFile = path.join(publicDir, mapFilename);

// Write file
fs.writeFileSync(mapFile, JSON.stringify(prefetchMap, null, 2));

// Also write a small "latest" pointer
fs.writeFileSync(
  path.join(publicDir, "prefetch-map-latest.json"),
  JSON.stringify({ file: mapFilename })
);

console.log("---------------------------------------------------");
console.log(`🎥 Generated map: ${mapFilename}`);
console.log("---------------------------------------------------");

  console.log("---------------------------------------------------");
  console.log(`🎥 Generated map with ${prefetchMap.length} entries.`);
  console.log(`Sync complete: wrote=${wrote}, skipped=${skipped}, failed=${failed}`);
  console.log("---------------------------------------------------");
}

run().catch((e) => {
  console.error("🔥 Sync script crashed:", e);
  process.exit(1);
});