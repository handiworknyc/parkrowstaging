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

  let imgObj = null;

  const videoField = row.video || (row.data && row.data.video);
  if (Array.isArray(videoField) && videoField[0]?.yt_img) {
    const raw = videoField[0].yt_img;
    const s = raw.sizes || {};

    const candidates = [
      { url: s.intch_xl || raw.url, w: s["intch_xl-width"] },
      { url: s.intch_lg, w: s["intch_lg-width"] },
      { url: s.intch_med, w: s["intch_med-width"] },
      { url: s.intch_sm, w: s["intch_sm-width"] },
    ].filter((c) => c.url && c.w);

    const srcSetString = candidates.map((c) => `${c.url} ${c.w}w`).join(", ");

    return {
      href: s.intch_xl || raw.url,
      imagesrcset: srcSetString || undefined,
      imagesizes: "(max-width: 1200px) 60vw, 100vw",
    };
  }

  const imageKeys = ["image", "hero_image", "background_image", "bg_image", "mobile_image", "desktop_image"];
  const dataSource = row.data || row;

  for (const key of imageKeys) {
    if (dataSource[key] && typeof dataSource[key] === "object") {
      const img = dataSource[key];
      return {
        href: img.url || img.sourceUrl || img.src,
        imagesrcset: img.srcset || img.srcSet || undefined,
        imagesizes: "100vw",
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
  
  // ✅ NEW: Path for the Page Order Manifest
  const outOrder = path.join(process.cwd(), "src", "content", "wp", "page-order.json"); 
  
  const publicDir = path.join(process.cwd(), "public");

  fs.mkdirSync(outPages, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

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
  
  // ✅ NEW: Initialize manifest array
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

      // ✅ NEW: Capture Title and URI for manifest
      // WP often puts title in data.title.rendered, but sometimes just data.title
      const pageTitle = data.title?.rendered || data.title || "Untitled Page";
      
      pageManifest.push({
        uri: cleanPath,
        title: pageTitle
      });

      const firstRow = layouts[0];
      const entry = { path: cleanPath };
      let hasEntry = false;

      const videoField = firstRow.video || (firstRow.data && firstRow.data.video);
      if (videoField && Array.isArray(videoField)) {
        const videoObj = videoField[0];
        if (videoObj && videoObj.cf_stream_video) {
          const manifestUrl = videoObj.cf_stream_video;
          entry.video = manifestUrl;

          const idMatch = manifestUrl.match(/com\/([^/]+)\//);
          if (idMatch) {
            const videoId = idMatch[1];
            const mp4Url = manifestUrl.replace("/manifest/video.m3u8", "/downloads/default.mp4");

            entry.video_mp4 = `/videos/${videoId}.mp4`;

            const videosDir = path.join(publicDir, "videos");
            fs.mkdirSync(videosDir, { recursive: true });

            const localPath = path.join(videosDir, `${videoId}.mp4`);
            const exists = fs.existsSync(localPath);

            if (!exists) {
              console.log(`⬇️  Downloading MP4 for ${videoId}`);

              try {
                const res = await fetch(mp4Url);
                if (!res.ok) {
                  console.warn(`⚠️ MP4 not downloadable (${res.status}): ${mp4Url}`);
                } else {
                  const buffer = Buffer.from(await res.arrayBuffer());
                  fs.writeFileSync(localPath, buffer);
                  console.log(`💾 Saved MP4 → ${localPath}`);
                }
              } catch (err) {
                console.warn(`⚠️ MP4 download failed for ${videoId}`, err);
              }
            } else {
              console.log(`✓ MP4 exists for ${videoId}`);
            }
          }

          hasEntry = true;
        }
      }

      const lcpData = getRawLcpImage(firstRow);
      if (lcpData) {
        entry.lcp = lcpData;
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

  // ✅ NEW: Write the Page Order JSON
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
  const hash = hashJSON(prefetchMap);
  const mapFilename = `prefetch-map.${hash}.json`;
  const mapFile = path.join(publicDir, mapFilename);

  fs.writeFileSync(mapFile, JSON.stringify(prefetchMap, null, 2));

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