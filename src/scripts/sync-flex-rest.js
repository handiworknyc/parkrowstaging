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
const AVESDO_TOKEN = (process.env.AVESDO || "").trim();
const AUTH = process.env.WP_AUTH_BASIC
  ? "Basic " + Buffer.from(process.env.WP_AUTH_BASIC, "utf8").toString("base64")
  : null;
const AVESDO_API_BASE = "https://api.avesdo.com";
const AVESDO_PARK_ROW_DEVELOPMENT = {
  id: 756,
  name: "Park Row - Bellevue",
  buildingName: "Park Row - Bellevue",
  developerName: "Bosa Development (Park Row) LP",
};

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

async function fetchText(url, opts = {}) {
  const { headers = {}, ...rest } = opts;
  const res = await fetch(url, {
    ...rest,
    headers: { ...authHeaders(), ...headers },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}\n${text.slice(0, 400)}`);
  }
  return { text, res };
}

function formatBathCount(bathrooms, halfBathrooms) {
  const full = Number(bathrooms || 0);
  const half = Number(halfBathrooms || 0);
  return full + half * 0.5;
}

function formatAvesdoText(value) {
  return String(value ?? "").trim();
}

async function fetchAvesdoJSON(pathname) {
  if (!AVESDO_TOKEN) {
    throw new Error("Missing AVESDO token.");
  }

  const url = new URL(pathname, AVESDO_API_BASE);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${AVESDO_TOKEN}`,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  let json;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Avesdo returned non-JSON for ${url}: HTTP ${res.status}\n${text.slice(0, 400)}`);
  }

  if (!res.ok) {
    throw new Error(`Avesdo HTTP ${res.status} ${url}\n${JSON.stringify(json).slice(0, 400)}`);
  }

  return json;
}

function compareUnitNumbers(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

async function fetchAvesdoParkRowInventory() {
  const properties = await fetchAvesdoJSON(
    `/v2/developments/${AVESDO_PARK_ROW_DEVELOPMENT.id}/properties`
  );

  if (!Array.isArray(properties)) {
    throw new Error("Avesdo properties response was not an array.");
  }

  const units = properties
    .map((property) => {
      const bathrooms = formatBathCount(property?.bathrooms, property?.halfBathrooms);
      const orientation = formatAvesdoText(property?.Orientation ?? property?.orientation);

      return {
        id: Number(property?.id || 0),
        unitNumber: formatAvesdoText(property?.unitNumber),
        bedrooms: Number(property?.bedrooms || 0),
        bathrooms,
        area: Number(property?.floorArea || 0),
        floorPlanImage: formatAvesdoText(property?.floorPlanImage),
        floorPlan: formatAvesdoText(property?.floorPlan),
        status: formatAvesdoText(property?.status),
        availability: formatAvesdoText(property?.availability),
        orientation,
      };
    })
    .filter((unit) => unit.id && unit.unitNumber)
    .sort((a, b) => compareUnitNumbers(a.unitNumber, b.unitNumber));

  return {
    development: AVESDO_PARK_ROW_DEVELOPMENT,
    units,
  };
}

function readJSONIfExists(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJSONIfChanged(file, data, updatedMessage, unchangedMessage) {
  const nextHash = hashJSON(data);
  const current = readJSONIfExists(file);
  const currentHash = current ? hashJSON(current) : null;

  if (nextHash === currentHash) {
    console.log(unchangedMessage);
    return false;
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(updatedMessage);
  return true;
}

function normalizeHost(host) {
  return String(host || "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

function parseHeaderMenuHtml(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  if (text.startsWith('"') && text.includes("<li")) {
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === "string" ? parsed : text;
    } catch {
      return text;
    }
  }

  return text;
}

function looksLikeMenuHtml(value) {
  const text = String(value ?? "").trim();
  return !!text && /<li\b|<ul\b|<a\b/i.test(text);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function rewriteMenuUrls(html) {
  if (!html) return "";

  let wpBase = null;
  try {
    wpBase = new URL(WP_BASE);
  } catch {
    wpBase = null;
  }

  return html.replace(/href=(['"])([^'"]+)\1/gi, (full, quote, href) => {
    try {
      if (/^(mailto:|tel:|sms:|javascript:|#)/i.test(href)) return full;

      if (/^\/\//.test(href)) {
        if (!wpBase) return `href=${quote}/${href.replace(/^\/+/, "")}${quote}`;
        const sameProtocolUrl = new URL(`${wpBase.protocol}${href}`);
        if (normalizeHost(sameProtocolUrl.hostname) === normalizeHost(wpBase.hostname)) {
          return `href=${quote}${sameProtocolUrl.pathname || "/"}${sameProtocolUrl.search || ""}${sameProtocolUrl.hash || ""}${quote}`;
        }
        return full;
      }

      if (!/^https?:\/\//i.test(href)) return full;

      const target = new URL(href);
      if (!wpBase || normalizeHost(target.hostname) !== normalizeHost(wpBase.hostname)) {
        return full;
      }

      return `href=${quote}${target.pathname || "/"}${target.search || ""}${target.hash || ""}${quote}`;
    } catch {
      return full;
    }
  });
}

async function fetchHeaderMenuViaGraphQL() {
  if (!GRAPHQL) return "";

  const query = `query HeaderMenuFallback {
    menus(first: 1, where: { location: PRIMARY }) {
      nodes {
        menuItems(first: 100) {
          nodes {
            databaseId
            label
            title
            uri
            url
            target
            cssClasses
          }
        }
      }
    }
  }`;

  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ query }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GraphQL HTTP ${res.status} ${GRAPHQL}\n${text.slice(0, 400)}`);
  }

  let json = {};
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`GraphQL menu parse failed: ${error?.message || error}`);
  }

  if (Array.isArray(json?.errors) && json.errors.length) {
    throw new Error(`GraphQL menu errors: ${JSON.stringify(json.errors).slice(0, 400)}`);
  }

  const items = json?.data?.menus?.nodes?.[0]?.menuItems?.nodes ?? [];
  if (!Array.isArray(items) || !items.length) return "";

  return items
    .map((item) => {
      const id = Number(item?.databaseId);
      const href = item?.uri || item?.url || "#";
      const label = item?.label || item?.title || "Menu";
      const cssClasses = Array.isArray(item?.cssClasses)
        ? item.cssClasses.filter(Boolean)
        : [];
      const classes = ["menu-item", id ? `menu-item-${id}` : "", ...cssClasses]
        .filter(Boolean)
        .join(" ");
      const target = item?.target ? ` target="${escapeAttr(item.target)}"` : "";
      const rel = item?.target === "_blank" ? ' rel="noopener noreferrer"' : "";
      const liId = id ? ` id="nav-menu-item-${id}"` : "";
      return `<li class="${escapeAttr(classes)}"${liId}><a href="${escapeAttr(href)}"${target}${rel}>${escapeHtml(label)}</a></li>`;
    })
    .join("");
}

async function fetchHeaderMenuHTML() {
  const endpoint = new URL("/wp-json/astro/v1/headermenu", WP_BASE);

  try {
    const { text } = await fetchText(endpoint, {
      headers: { Accept: "text/html,application/json;q=0.9" },
    });
    const html = rewriteMenuUrls(parseHeaderMenuHtml(text));
    if (looksLikeMenuHtml(html)) return html;
  } catch (error) {
    console.warn(`⚠️ Header menu REST fetch failed: ${error?.message || error}`);
  }

  try {
    const html = rewriteMenuUrls(await fetchHeaderMenuViaGraphQL());
    if (looksLikeMenuHtml(html)) return html;
  } catch (error) {
    console.warn(`⚠️ Header menu GraphQL fallback failed: ${error?.message || error}`);
  }

  return "";
}

async function fetchHeaderMenuCN() {
  const endpoint = new URL("/wp-json/astro/v1/headermenu-cn", WP_BASE);
  const { json } = await fetchJSON(endpoint);
  const items = {};

  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return items;
  }

  for (const [key, value] of Object.entries(json)) {
    if (typeof value !== "string") continue;
    const normalizedKey = String(Number(key));
    if (normalizedKey === "NaN") continue;
    items[normalizedKey] = value;
  }

  return items;
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
   GRAVITY FORMS HELPERS
------------------------------------------- */
function gfAuthHeaders(method, route) {
  const key = process.env.GF_CONSUMER_KEY;
  const secret = process.env.GF_CONSUMER_SECRET;

  if (!key || !secret) {
    throw new Error("Missing Gravity Forms API keys");
  }

  const expires = Math.floor(Date.now() / 1000) + 60;
  const stringToSign = `${key}:${method}:${route}:${expires}`;
  const signature = crypto
    .createHmac("sha1", secret)
    .update(stringToSign)
    .digest("hex");

  return {
    Authorization: `GFAPI ${key}:${signature}:${expires}`
  };
}

async function fetchGFFormsIndex() {
  const url = new URL("/wp-json/astro/v1/gf/forms", WP_BASE);
  const { json } = await fetchJSON(url);
  return json;
}

async function fetchGFForm(formId) {
  const url = new URL(`/wp-json/astro/v1/gf/forms/${formId}`, WP_BASE);
  const { json } = await fetchJSON(url);
  return json;
}

function normalizeGFForm(form) {
  const edgewiseSourceChoices = [
    { text: "Social Media", value: "Social Media" },
    { text: "Email", value: "Email" },
    { text: "Referral", value: "Referral" },
    { text: "Advertisement", value: "Advertisement" },
    { text: "Other", value: "Other" },
    { text: "Online Search", value: "Online Search" },
    { text: "Signage", value: "Signage" },
    { text: "Realtor/Broker", value: "Realtor/Broker" },
    { text: "Article/Press", value: "Article/Press" },
    { text: "Direct Mail", value: "Direct Mail" }
  ];

  const normalizeConditionalLogic = (logic) => {
    if (!logic || typeof logic !== "object" || !logic.enabled) {
      return undefined;
    }

    const rules = Array.isArray(logic.rules)
      ? logic.rules
          .map((rule) => ({
            fieldId: Number(rule?.fieldId || 0),
            operator: typeof rule?.operator === "string" ? rule.operator : "is",
            value: rule?.value == null ? "" : String(rule.value)
          }))
          .filter((rule) => rule.fieldId > 0)
      : [];

    if (!rules.length) {
      return undefined;
    }

    return {
      enabled: true,
      actionType: logic.actionType === "hide" ? "hide" : "show",
      logicType: logic.logicType === "any" ? "any" : "all",
      rules
    };
  };

  return {
    id: form.id,
    title: form.title,
    description: form.description || "",
    fields: (form.fields || [])
      .filter(f => !f.isHidden)
      .map(f => ({
        id: f.id,
        type: f.type,
        label: f.label || "",
        isRequired: !!f.isRequired,
        placeholder: f.placeholder || "",
        conditionalLogic: normalizeConditionalLogic(f.conditionalLogic),
        choices:
          Number(form.id) === 1 && Number(f.id) === 10
            ? edgewiseSourceChoices
            : Array.isArray(f.choices)
              ? f.choices.map(c => ({
                  text: c.text,
                  value: c.value
                }))
              : undefined
      }))
  };
}

/* -------------------------------------------
   Fetch Schema Address
------------------------------------------- */
async function fetchSchemaAddress() {
  const url = new URL("/wp-json/astro/v1/schema/address", WP_BASE);
  const { json } = await fetchJSON(url);
  return json;
}

async function fetchFloorPlanDetail() {
  const url = new URL("/wp-json/astro/v1/floor-plan-detail", WP_BASE);
  const { json } = await fetchJSON(url);
  return json;
}

async function fetchPanoramicViews() {
  const url = new URL("/wp-json/astro/v1/panoramic-views", WP_BASE);
  const { json } = await fetchJSON(url);
  return json;
}

/* -------------------------------------------
   SEO-Friendly Download & Cache
   Format: "my-image-hash.jpg.webp"
   isPanorama = true → 5000px limit, 4MB limit
------------------------------------------- */
async function downloadAndCache(url, outputDir, isPanorama = false) {
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
      const tempInput = path.join(outputDir, `temp-${hash}${ext}`);
      fs.writeFileSync(tempInput, buffer);

      try {
        const cwebpArgs = [tempInput];
        
        // Panorama images: 5000px width limit, 4MB size limit
        if (isPanorama) {
          cwebpArgs.push('-resize', '5000', '0');
          cwebpArgs.push('-size', '4194304'); // 4MB in bytes
        } else {
          // Standard images: 2MB limit
          cwebpArgs.push('-size', '2097152');
        }
        
        cwebpArgs.push('-q', '95', '-o', localPath);
        
        await execFileP(cwebp, cwebpArgs);
        
        const sizeLabel = isPanorama ? '5000px/4MB' : '2MB';
        console.log(`✨ Converted & Cached (${sizeLabel}): ${filename}`);
      } catch (err) {
        console.warn(`⚠️ Conversion failed for ${filename}, saving original.`, err.message);
        fs.writeFileSync(localPath, buffer);
      } finally {
        if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      }
    } else {
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
   Returns Set of { url, isPanorama } objects
------------------------------------------- */
function recurseFindImages(obj, collected = new Set(), parentContext = {}) {
  if (!obj || typeof obj !== 'object') return collected;

  // Use panorama flag from parent context (passed down from layout)
  const isPanorama = parentContext.isPanorama || false;

  // 1. Check if object looks like a WP Image (has 'url')
  if (typeof obj.url === 'string') {
    
    // A. Add Full Size (always)
    if (obj.url.match(/\.(jpeg|jpg|png|webp|gif|svg)(?:[?#].*)?$/i)) {
      collected.add(JSON.stringify({ url: obj.url, isPanorama }));
    }

    // B. Check 'sizes' for intch_ candidates
    if (obj.sizes && typeof obj.sizes === 'object') {
      for (const [key, val] of Object.entries(obj.sizes)) {
        if (key.startsWith('intch_')) {
          if (typeof val === 'string') {
            collected.add(JSON.stringify({ url: val, isPanorama }));
          } 
          else if (val && typeof val === 'object' && typeof val.url === 'string') {
            collected.add(JSON.stringify({ url: val.url, isPanorama }));
          }
          else if (val && typeof val === 'object' && typeof val.source_url === 'string') {
            collected.add(JSON.stringify({ url: val.source_url, isPanorama }));
          }
        }
      }
    }
  }

  // 2. Recurse through all children (arrays or objects), passing down the same context
  for (const val of Object.values(obj)) {
    recurseFindImages(val, collected, parentContext);
  }

  return collected;
}

function parseCollectedImageObjects(collected) {
  return Array.from(collected)
    .map((value) => {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    })
    .filter((value) => value && typeof value.url === "string");
}

async function cacheStructuredDataImages(data, imgCacheDir) {
  const imageUrlObjects = parseCollectedImageObjects(recurseFindImages(data));
  const urlMap = new Map();

  for (const { url, isPanorama } of imageUrlObjects) {
    const localUrl = await downloadAndCache(url, imgCacheDir, isPanorama);
    if (localUrl) {
      urlMap.set(url, localUrl);
    }
  }

  return {
    data: replaceImageUrls(data, urlMap),
    transformedImageCount: urlMap.size,
  };
}

/* -------------------------------------------
   REPLACE IMAGE URLS IN DATA
------------------------------------------- */
function replaceImageUrls(obj, urlMap) {
  if (!obj) return obj;
  
  if (typeof obj === "string") {
    // If this URL was downloaded, replace with local path
    return urlMap.get(obj) || obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => replaceImageUrls(item, urlMap));
  }
  
  if (typeof obj === "object") {
    const result = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = replaceImageUrls(val, urlMap);
    }
    return result;
  }
  
  return obj;
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
  const outFloorPlanDetail = path.join(process.cwd(), "src", "content", "wp", "floor-plan-detail.json");
  const outPanoramicViews = path.join(process.cwd(), "src", "content", "wp", "panoramic-views.json");
  const outSpecials = path.join(process.cwd(), "src", "content", "wp", "specials.json");
  const outOrder = path.join(process.cwd(), "src", "content", "wp", "page-order.json"); 
  const outHeaderMenu = path.join(process.cwd(), "src", "content", "wp", "header-menu.json");
  const outHeaderMenuCN = path.join(process.cwd(), "src", "content", "wp", "header-menu-cn.json");
  const outAvesdoFloorplans = path.join(process.cwd(), "src", "content", "wp", "avesdo-floorplans.json");
  const publicDir = path.join(process.cwd(), "public");
  const outSchemaAddress = path.join(process.cwd(), "src", "content", "wp", "schema-address.json");
  const imgCacheDir = path.join(publicDir, "img-cache");

  fs.mkdirSync(outPages, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(imgCacheDir, { recursive: true });

  /* -------- AVESDO FLOORPLANS -------- */
  try {
    console.log("🏢 Fetching Avesdo Park Row inventory…");
    const inventory = await fetchAvesdoParkRowInventory();
    writeJSONIfChanged(
      outAvesdoFloorplans,
      inventory,
      `✅ Avesdo floorplans updated (${inventory.units.length} units)`,
      "⏩ Avesdo floorplans unchanged"
    );
  } catch (error) {
    console.warn(`⚠️ Failed to sync Avesdo floorplans: ${error?.message || error}`);
  }

  /* -------- FLOOR PLAN DETAIL -------- */
  try {
    console.log("🧭 Fetching Floor Plan Detail…");
    const floorPlanDetail = await fetchFloorPlanDetail();
    const transformed = await cacheStructuredDataImages(floorPlanDetail, imgCacheDir);

    writeJSONIfChanged(
      outFloorPlanDetail,
      transformed.data,
      `✨ Floor plan detail updated (${transformed.transformedImageCount} images transformed)`,
      "⏩ Floor plan detail unchanged — skip write"
    );
  } catch (error) {
    console.error(`❌ Failed to sync Floor Plan Detail: ${error?.message || error}`);
  }

  /* -------- PANORAMIC VIEWS -------- */
  try {
    console.log("🌆 Fetching Panoramic Views…");
    const panoramicViews = await fetchPanoramicViews();
    const transformed = await cacheStructuredDataImages(panoramicViews, imgCacheDir);

    writeJSONIfChanged(
      outPanoramicViews,
      transformed.data,
      `✨ Panoramic views updated (${transformed.transformedImageCount} images transformed)`,
      "⏩ Panoramic views unchanged — skip write"
    );
  } catch (error) {
    console.error(`❌ Failed to sync Panoramic Views: ${error?.message || error}`);
  }

  /* -------- PAGES -------- */
  let pageUris = PAGE_URIS_ENV
    ? PAGE_URIS_ENV.split(",").map((s) => s.trim()).filter(Boolean)
    : await discoverPagesViaREST().catch(() => []);

  if (!pageUris.length) {
    const fb = await discoverPagesViaGraphQL();
    if (fb.length) pageUris = fb;
  }

  console.log(`🔎 Pages discovered: ${pageUris.length}`);
  const shouldSyncPages = pageUris.length > 0;
  if (!shouldSyncPages) {
    console.warn("⚠️ No pages discovered; skipping page JSON and prefetch refresh.");
  }

  let wrote = 0, skipped = 0, failed = 0;

  const prefetchMap = [];
  const pageManifest = []; 

  /* -------- GRAVITY FORMS SYNC -------- */
  try {
    console.log("🧾 Fetching Gravity Forms…");

    const formsIndex = await fetchGFFormsIndex();
    const formsDir = path.join(process.cwd(), "src", "content", "wp", "forms");

    fs.mkdirSync(formsDir, { recursive: true });

    const manifest = [];

    for (const f of formsIndex) {
      const formId = f.id;
      const raw = await fetchGFForm(formId);
      const normalized = normalizeGFForm(raw);

      const file = path.join(formsDir, `form-${formId}.json`);
      const newHash = hashJSON(normalized);
      let oldHash = null;

      if (fs.existsSync(file)) {
        try {
          const old = JSON.parse(fs.readFileSync(file, "utf8"));
          oldHash = hashJSON(old);
        } catch {}
      }

      if (newHash !== oldHash) {
        fs.writeFileSync(file, JSON.stringify(normalized, null, 2));
        console.log(`✅ GF form ${formId} updated`);
      } else {
        console.log(`⏩ GF form ${formId} unchanged`);
      }

      manifest.push({
        id: normalized.id,
        title: normalized.title,
        file: `form-${formId}.json`
      });
    }

    fs.writeFileSync(
      path.join(formsDir, "index.json"),
      JSON.stringify(manifest, null, 2)
    );

    console.log(`📘 Gravity Forms synced (${manifest.length})`);
  } catch (e) {
    console.error("❌ Gravity Forms sync failed:", e.message || e);
  }

  /* -------- PAGE SYNC -------- */
  if (shouldSyncPages) {
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

        // 1. Collect ALL image URLs from this page (with isPanorama context)
        const imageUrlStrings = new Set();
        
        // Process each layout to detect panorama flag at the layout level
        for (const layout of layouts) {
          const isPanoramaLayout = layout.panorama === true || layout.panorama === 'true' || layout.panorama === 1;
          if (isPanoramaLayout) {
            console.log(`🔍 PANORAMA DETECTED on page ${uri} - layout type: ${layout.acf_fc_layout}`);
          }
          const context = isPanoramaLayout ? { isPanorama: true } : {};
          recurseFindImages(layout, imageUrlStrings, context);
        }
        
        // Parse JSON strings back to objects
        const imageUrlObjects = Array.from(imageUrlStrings).map(str => JSON.parse(str));
        
        // Count panorama images
        const panoramaCount = imageUrlObjects.filter(img => img.isPanorama).length;
        if (panoramaCount > 0) {
          console.log(`🖼️  Found ${panoramaCount} panorama images on ${uri}`);
        }
        
        // 2. Download them and build URL mapping
        const urlMap = new Map();
        for (const { url, isPanorama } of imageUrlObjects) {
          const localUrl = await downloadAndCache(url, imgCacheDir, isPanorama);
          if (localUrl) {
            urlMap.set(url, localUrl);
          }
        }

        // 3. ✅ REPLACE URLs in the data object
        const transformedData = replaceImageUrls(data, urlMap);

        // 4. Build Prefetch Map
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
            // Use the already-downloaded local URL from urlMap
            const localUrl = urlMap.get(c.url);
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

        // 5. Write the TRANSFORMED data
        const file = path.join(outPages, `${fileSlugFromUri(uri)}.json`);
        fs.writeFileSync(file, JSON.stringify(transformedData, null, 2));
        console.log(`✅ Wrote ${file} (${urlMap.size} images transformed)`);
        wrote++;
      } catch (e) {
        console.error(`❌ Page ${uri}:`, e.message || e);
        failed++;
      }
    }
  }

  if (shouldSyncPages) {
    fs.writeFileSync(outOrder, JSON.stringify(pageManifest, null, 2));
    console.log(`📜 Wrote Page Order Manifest (${pageManifest.length} pages)`);
  } else {
    console.log("⏩ Page order unchanged — no pages discovered");
  }

  /* -------- SPECIALS SYNC -------- */
  try {
    console.log("🔄 Fetching Specials…");
    const specials = await fetchSpecials();
    
    // Transform image URLs in specials
    const imageUrlStrings = recurseFindImages(specials);
    const imageUrlObjects = Array.from(imageUrlStrings).map(str => JSON.parse(str));
    
    const urlMap = new Map();
    for (const { url, isPanorama } of imageUrlObjects) {
      const localUrl = await downloadAndCache(url, imgCacheDir, isPanorama);
      if (localUrl) urlMap.set(url, localUrl);
    }
    const transformedSpecials = replaceImageUrls(specials, urlMap);

    const newHash = hashJSON(transformedSpecials);
    let oldHash = null;

    if (fs.existsSync(outSpecials)) {
      try {
        const old = JSON.parse(fs.readFileSync(outSpecials, "utf8"));
        oldHash = hashJSON(old);
      } catch {}
    }

    if (newHash !== oldHash) {
      fs.writeFileSync(outSpecials, JSON.stringify(transformedSpecials, null, 2));
      console.log(`✨ Specials updated (${urlMap.size} images transformed)`);
    } else {
      console.log("⏩ Specials unchanged — skip write");
    }
  } catch (e) {
    console.error("❌ Failed to sync Specials:", e.message || e);
  }

  /* -------- SCHEMA ADDRESS SYNC -------- */
  try {
    console.log("🏷 Fetching Schema Address…");
    const schemaAddress = await fetchSchemaAddress();

    const newHash = hashJSON(schemaAddress);
    let oldHash = null;

    if (fs.existsSync(outSchemaAddress)) {
      try {
        const old = JSON.parse(fs.readFileSync(outSchemaAddress, "utf8"));
        oldHash = hashJSON(old);
      } catch {}
    }

    if (newHash !== oldHash) {
      fs.writeFileSync(outSchemaAddress, JSON.stringify(schemaAddress, null, 2));
      console.log("✨ Schema address updated");
    } else {
      console.log("⏩ Schema address unchanged — skip write");
    }
  } catch (e) {
    console.error("❌ Failed to sync Schema Address:", e.message || e);
  }

  /* -------- HEADER MENU SYNC -------- */
  try {
    console.log("🧭 Fetching Header Menu…");
    const headerMenu = await fetchHeaderMenuHTML();
    if (!looksLikeMenuHtml(headerMenu)) {
      console.warn("⚠️ Header menu fetch returned empty/invalid markup; preserving existing cached menu.");
    } else {
      writeJSONIfChanged(
        outHeaderMenu,
        { html: headerMenu },
        "✨ Header menu updated",
        "⏩ Header menu unchanged — skip write"
      );
    }
  } catch (e) {
    console.error("❌ Failed to sync Header Menu:", e.message || e);
  }

  /* -------- HEADER MENU CN SYNC -------- */
  try {
    console.log("🇨🇳 Fetching Header Menu CN…");
    const headerMenuCN = await fetchHeaderMenuCN();
    writeJSONIfChanged(
      outHeaderMenuCN,
      { items: headerMenuCN },
      "✨ Header menu CN updated",
      "⏩ Header menu CN unchanged — skip write"
    );
  } catch (e) {
    console.error("❌ Failed to sync Header Menu CN:", e.message || e);
  }

  const mapFile = path.join(publicDir, "prefetch-map.json");
  if (shouldSyncPages) {
    fs.writeFileSync(mapFile, JSON.stringify(prefetchMap, null, 2));
    console.log("---------------------------------------------------");
    console.log(`🎥 Generated map: prefetch-map.json`);
    console.log(`Entries: ${prefetchMap.length}`);
  } else {
    console.log("---------------------------------------------------");
    console.log("🎥 Prefetch map unchanged — no pages discovered");
  }
  console.log(`Sync complete: wrote=${wrote}, skipped=${skipped}, failed=${failed}`);
  console.log("---------------------------------------------------");
}

run().catch((e) => {
  console.error("🔥 Sync script crashed:", e);
  process.exit(1);
});
