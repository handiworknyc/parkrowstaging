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
------------------------------------------- */
if (!process.env.NETLIFY) {
  try {
    const { config } = await import("dotenv");
    const mode = process.env.NODE_ENV === "production" ? "production" : "development";
    config({ path: `.env.${mode}` });
    config();
  } catch {}
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
   NEW: Download & Cache Helper
------------------------------------------- */
async function downloadAndCache(url, outputDir) {
  if (!url || typeof url !== 'string') return null;
  
  try {
    // Create a hash filename to avoid collisions and invalid chars
    const hash = crypto.createHash("md5").update(url).digest("hex");
    const ext = path.extname(url).split("?")[0] || ".jpg"; // Default to .jpg if no ext
    const filename = `${hash}${ext}`;
    const localPath = path.join(outputDir, filename);
    const publicUrl = `/img-cache/${filename}`;

    // If exists, skip download
    if (fs.existsSync(localPath)) {
      return publicUrl;
    }

    // Download with Auth headers
    const res = await fetch(url, { headers: { ...authHeaders() } });
    if (!res.ok) {
      console.warn(`⚠️ Failed to download ${url} (${res.status})`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    console.log(`📥 Cached: ${filename}`);
    
    return publicUrl;
  } catch (e) {
    console.warn(`⚠️ Error downloading ${url}:`, e.message);
    return null;
  }
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
   Fetch Specials JSON
------------------------------------------- */
async function fetchSpecials() {
  const url = new URL("/wp-json/astro/v1/specials", WP_BASE);
  const { json } = await fetchJSON(url);
  return json;
}

/* -------------------------------------------
   LCP helper
------------------------------------------- */
function getRawLcpImage(row) {
  if (!row) return null;

  const videoField = row.video || (row.data && row.data.video);
  if (Array.isArray(videoField) && videoField[0]?.yt_img) {
    const raw = videoField[0].yt_img;
    const s = raw.sizes || {};
    
    // We prioritize the largest one for LCP preload
    return {
      href: s.intch_xl || raw.url,
      // We are intentionally NOT returning srcset here anymore 
      // because we want to force the single cached local file.
    };
  }

  const imageKeys = ["image", "hero_image", "background_image", "bg_image", "mobile_image", "desktop_image"];
  const dataSource = row.data || row;

  for (const key of imageKeys) {
    if (dataSource[key] && typeof dataSource[key] === "object") {
      const img = dataSource[key];
      return {
        href: img.url || img.sourceUrl || img.src,
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
  const outSpecials = path.join(process.cwd(), "src", "content", "wp", "specials.json");
  const outOrder = path.join(process.cwd(), "src", "content", "wp", "page-order.json"); 
  const publicDir = path.join(process.cwd(), "public");
  
  // ✅ NEW: Image Cache Directory
  const imgCacheDir = path.join(publicDir, "img-cache");

  fs.mkdirSync(outPages, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(imgCacheDir, { recursive: true });

  /* -------- PAGES -------- */
  let pageUris = PAGE_URIS_ENV
    ? PAGE_URIS_ENV.split(",").map((s) => s.trim()).filter(Boolean)
    : await discoverPagesViaREST().catch(() => []);

  if (!pageUris.length) {
    const fb = await discoverPagesViaGraphQL();
    if (fb.length) pageUris = fb;
  }

  console.log(`🔎 Pages discovered: ${pageUris.length}`);
  if (!pageUris.length) return;

  let wrote = 0,
    skipped = 0,
    failed = 0;

  const prefetchMap = [];
  const pageManifest = []; 

  for (const uri of pageUris) {
    try {
      const data = await fetchFlexibleForPage(uri);
      const layouts = Array.isArray(data?.layouts) ? data.layouts : [];
      if (!layouts.length) {
        skipped++;
        continue;
      }

      const cleanPath = toPathname(uri);
      const pageTitle = data.title?.rendered || data.title || "Untitled Page";
      
      pageManifest.push({
        uri: cleanPath,
        title: pageTitle
      });

      const firstRow = layouts[0];
      const entry = { path: cleanPath };
      let hasEntry = false;

      // 🔍 DETECT VIDEO
      const videoField = firstRow.video || (firstRow.data && firstRow.data.video);
      if (videoField && Array.isArray(videoField)) {
        const videoObj = videoField[0];
        if (videoObj && videoObj.cf_stream_video) {
          entry.video = videoObj.cf_stream_video;
          hasEntry = true;
        }
      }

      // 🔍 DETECT AND DOWNLOAD LCP IMAGE
      const lcpData = getRawLcpImage(firstRow);
      if (lcpData && lcpData.href) {
        // Download the protected image to public/img-cache/
        const localUrl = await downloadAndCache(lcpData.href, imgCacheDir);
        
        if (localUrl) {
          // Replace remote WP URL with safe local URL
          entry.lcp = {
            href: localUrl,
            type: "image/jpeg" // You might want to detect this or assume jpeg/webp
          };
          hasEntry = true;
        }
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

  // Write Page Order Manifest
  fs.writeFileSync(outOrder, JSON.stringify(pageManifest, null, 2));
  console.log(`📜 Wrote Page Order Manifest (${pageManifest.length} pages)`);

  /* -------- SPECIALS SYNC -------- */
  try {
    console.log("🔄 Fetching Specials…");
    const specials = await fetchSpecials();

    const newHash = hashJSON(specials);
    let oldHash = null;

    if (fs.existsSync(outSpecials)) {
      try {
        const old = JSON.parse(fs.readFileSync(outSpecials, "utf8"));
        oldHash = hashJSON(old);
      } catch {}
    }

    if (newHash !== oldHash) {
      fs.writeFileSync(outSpecials, JSON.stringify(specials, null, 2));
      console.log("✨ Specials updated");
    } else {
      console.log("⏩ Specials unchanged — skip write");
    }
  } catch (e) {
    console.error("❌ Failed to sync Specials:", e.message || e);
  }

  /* -------- PREFETCH MAP -------- */
  const mapFile = path.join(publicDir, "prefetch-map.json");
  fs.writeFileSync(mapFile, JSON.stringify(prefetchMap, null, 2));

  console.log("---------------------------------------------------");
  console.log(`🎥 Generated map: prefetch-map.json`);
  console.log(`Entries: ${prefetchMap.length}`);
  console.log(`Sync complete: wrote=${wrote}, skipped=${skipped}, failed=${failed}`);
  console.log("---------------------------------------------------");
}

run().catch((e) => {
  console.error("🔥 Sync script crashed:", e);
  process.exit(1);
});