// src/scripts/sync-flex-rest.js
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "crypto";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import cwebp from "cwebp-bin";

const execFileP = promisify(execFile);

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
SEO-Friendly Download & Cache
Format: "my-image-hash.jpg.webp"
------------------------------------------- */
async function downloadAndCache(url, outputDir) {
  if (!url || typeof url !== 'string') return null;

  try {
    let processUrl = url;

    // 1. STRIP .webp if it is a double extension
    if (processUrl.toLowerCase().endsWith('.webp')) {
      const withoutWebp = processUrl.slice(0, -5);
      const extBefore = path.extname(withoutWebp);
      if (['.jpg', '.jpeg', '.png'].includes(extBefore.toLowerCase())) {
        processUrl = withoutWebp;
      }
    }

    // 2. Generate Hash
    const hash = crypto.createHash("md5").update(processUrl).digest("hex").slice(0, 8);
    
    // 3. Extract and clean filename
    const urlObj = new URL(processUrl);
    const basename = path.basename(urlObj.pathname);
    const ext = path.extname(basename);
    const nameWithoutExt = path.basename(basename, ext);
    
    // 4. Sanitize name
    const cleanName = nameWithoutExt.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
    
    // 5. Determine Final Extension (we force .webp for compatible types)
    let finalExt = ext;
    const isConvertible = ['.jpg', '.jpeg', '.png', '.tiff', '.webp'].includes(ext.toLowerCase());
    
    if (isConvertible) {
      // e.g. image.jpg -> image.jpg.webp
      finalExt = `${ext}.webp`;
    }

    // 6. Define Paths
    const filename = `${cleanName}-${hash}${finalExt}`;
    const localPath = path.join(outputDir, filename);
    const publicUrl = `/img-cache/${filename}`;

    // If exists, skip download
    if (fs.existsSync(localPath)) {
      return publicUrl;
    }

    // 7. Download to Buffer
    const res = await fetch(url, { headers: { ...authHeaders() } });
    if (!res.ok) {
      console.warn(`⚠️ Failed to download ${url} (${res.status})`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());

    // 8. Process Image
    if (isConvertible) {
      // Create a temp file for cwebp input
      const tempInput = path.join(outputDir, `temp-${hash}${ext}`);
      fs.writeFileSync(tempInput, buffer);

      try {
        // Run cwebp
        // -size 2097152 = 2MB limit
        // -q 80 = Base quality (cwebp will lower this if needed to hit size limit)
        await execFileP(cwebp, [
          tempInput, 
          '-size', '2097152', 
          '-q', '80', 
          '-o', localPath
        ]);
        console.log(`✨ Converted & Cached (Max 2MB): ${filename}`);
      } catch (err) {
        console.warn(`⚠️ Conversion failed for ${filename}, saving original.`, err.message);
        // Fallback: just write the original buffer if cwebp fails
        fs.writeFileSync(localPath, buffer);
      } finally {
        // Cleanup temp file
        if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      }
    } else {
      // For GIFs or other unsupported formats, just save raw
      fs.writeFileSync(localPath, buffer);
      console.log(`📥 Cached (Raw): ${filename}`);
    }

    return publicUrl;
  } catch (e) {
    console.warn(`⚠️ Error processing ${url}:`, e.message);
    return null;
  }
}

/* -------------------------------------------
   RECURSIVE IMAGE FINDER
------------------------------------------- */
function recurseFindImages(obj, collected = new Set()) {
  if (!obj || typeof obj !== 'object') return collected;

  // 1. Check if object looks like a WP Image (has 'url')
  if (typeof obj.url === 'string') {
    
    // A. Add Full Size (always)
    if (obj.url.match(/\.(jpeg|jpg|png|webp|gif)$/i)) {
      collected.add(obj.url);
    }

    // B. Check 'sizes' for intch_ candidates
    if (obj.sizes && typeof obj.sizes === 'object') {
      for (const [key, val] of Object.entries(obj.sizes)) {
        if (key.startsWith('intch_')) {
          if (typeof val === 'string') {
            collected.add(val);
          } 
          else if (val && typeof val === 'object' && typeof val.url === 'string') {
            collected.add(val.url);
          }
          else if (val && typeof val === 'object' && typeof val.source_url === 'string') {
             collected.add(val.source_url);
          }
        }
      }
    }
  }

  // 2. Recurse through all children (arrays or objects)
  for (const val of Object.values(obj)) {
    recurseFindImages(val, collected);
  }

  return collected;
}

async function processAllPageImages(data, imgCacheDir) {
  const imageUrls = recurseFindImages(data);
  const results = [];

  if (imageUrls.size > 0) {
    for (const url of imageUrls) {
      const local = await downloadAndCache(url, imgCacheDir);
      if (local) results.push(local);
    }
  }
  return results;
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
   LCP Helper: Extracts Candidates
------------------------------------------- */
function getRawLcpImage(row) {
  if (!row) return null;

  // --- Helper: Extract LCP data from a Video Array ---
  const extractFromVideoArr = (vidArr) => {
    if (Array.isArray(vidArr) && vidArr[0]?.yt_img) {
      const raw = vidArr[0].yt_img;
      const s = raw.sizes || {};
      
      const candidates = [
        { url: s.intch_xl, w: s["intch_xl-width"] },
        { url: s.intch_lg, w: s["intch_lg-width"] },
        { url: s.intch_med, w: s["intch_med-width"] },
        { url: s.intch_sm, w: s["intch_sm-width"] },
      ]
      .filter((c) => c.url && c.w) 
      .map((c) => ({ url: c.url, w: `${c.w}w` }));

      if (candidates.length > 0) {
        return {
          candidates,
          sizesAttr: "(max-width: 1200px) 60vw, 100vw",
        };
      }
    }
    return null;
  };

  // 1. DIRECT VIDEO FIELD
  const directVideo = row.video || (row.data && row.data.video);
  const directResult = extractFromVideoArr(directVideo);
  if (directResult) return directResult;

  // 2. IMAGES ARRAY (for Grid/Gallery layouts)
  //    Structure: row.images = [ { video: [...] }, ... ]
  if (Array.isArray(row.images) && row.images.length > 0) {
    const firstImg = row.images[0];
    if (firstImg && firstImg.video) {
        const nestedResult = extractFromVideoArr(firstImg.video);
        if (nestedResult) return nestedResult;
    }
  }

  // 3. STANDARD IMAGE FIELDS
  const imageKeys = ["image", "hero_image", "background_image", "bg_image", "mobile_image", "desktop_image"];
  const dataSource = row.data || row;

  for (const key of imageKeys) {
    if (dataSource[key] && typeof dataSource[key] === "object") {
      const img = dataSource[key];
      const src = img.url || img.sourceUrl || img.src;
      if (!src) continue;

      const rawSrcSet = img.srcset || img.srcSet;
      if (rawSrcSet) {
        const candidates = rawSrcSet.split(",").map(p => {
            const parts = p.trim().split(/\s+/); 
            return { url: parts[0], w: parts[1] || null };
        }).filter(c => c.url);
        
        return { candidates, sizesAttr: "100vw" };
      }

      return {
        candidates: [{ url: src, w: null }],
        sizesAttr: "100vw",
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
      
      pageManifest.push({ uri: cleanPath, title: pageTitle });

      // 1. Process ALL Images (Full + intch_*) for this page
      await processAllPageImages(data, imgCacheDir);

      // 2. Build Prefetch Map
      const firstRow = layouts[0];
      const entry = { path: cleanPath };
      let hasEntry = false;

      // VIDEO
      const videoField = firstRow.video || (firstRow.data && firstRow.data.video);
      if (videoField && Array.isArray(videoField)) {
        const videoObj = videoField[0];
        if (videoObj && videoObj.cf_stream_video) {
          entry.video = videoObj.cf_stream_video;
          hasEntry = true;
        }
      }

      // LCP IMAGE
      const lcpData = getRawLcpImage(firstRow);
      if (lcpData && lcpData.candidates.length) {
        const processed = [];
        for (const c of lcpData.candidates) {
            const localUrl = await downloadAndCache(c.url, imgCacheDir);
            if (localUrl) {
                processed.push({ url: localUrl, w: c.w });
            }
        }

        if (processed.length > 0) {
            const srcSet = processed
                .filter(p => p.w)
                .map(p => `${p.url} ${p.w}`)
                .join(", ");
            
            entry.lcp = {
                href: processed[0].url,
                imagesrcset: srcSet || undefined,
                imagesizes: lcpData.sizesAttr,
                type: "image/webp" 
            };
            hasEntry = true;
        }
      }

      if (hasEntry) prefetchMap.push(entry);

      const file = path.join(outPages, `${fileSlugFromUri(uri)}.json`);
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      console.log(`✅ Wrote ${file}`);
      wrote++;
    } catch (e) {
      console.error(`❌ Page ${uri}:`, e.message || e);
      failed++;
    }
  }

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