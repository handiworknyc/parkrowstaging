// src/scripts/sync-flex-rest.js
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import cwebp from "cwebp-bin";

const execFileP = promisify(execFile);
const CLOUDFLARE_FALLBACK_POSTER_VARIANTS = [
  { key: "intch_full", width: 2400 },
  { key: "intch_xl", width: 1700 },
  { key: "intch_lg", width: 1400 },
  { key: "intch_med", width: 1000 },
  { key: "intch_sm", width: 600 },
];
const HERO_RESPONSIVE_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 90vw, (max-width: 1440px) 80vw, 1400px";
const FULL_WIDTH_RESPONSIVE_SIZES = "100vw";
const CAROUSEL_MOBILE_BREAKPOINT = 599;
const CAROUSEL_DESKTOP_BREAKPOINT = CAROUSEL_MOBILE_BREAKPOINT + 1;
const CRITICAL_CAROUSEL_IMAGE_COUNT = 3;

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
const DRAFT_ACCESS_SECRET = process.env.NETLIFY
  ? ""
  : (process.env.WP_DRAFT_ACCESS_SECRET || "").trim();
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
  return {
    ...(AUTH ? { Authorization: AUTH } : {}),
    ...(DRAFT_ACCESS_SECRET ? { "X-WP-Draft-Access-Secret": DRAFT_ACCESS_SECRET } : {}),
  };
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
        flex: Number(property?.flex ?? property?.Flex ?? 0),
        accessibility: formatAvesdoText(property?.custom1 ?? property?.Custom1),
        bathrooms,
        area: Number(property?.floorArea || 0),
        outdoorArea: Number(property?.outdoorArea || property?.OutdoorArea || 0),
        outdoorSpace: formatAvesdoText(property?.custom5 ?? property?.Custom5),
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

function normalizeTrimmedString(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function normalizePositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function pickStructuredUrl(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const candidates = [value.url, value.source_url, value.sourceUrl, value.href, value.link];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function normalizeSeoImage(value) {
  const url = pickStructuredUrl(value);
  if (!url) return null;

  const id = normalizePositiveNumber(value?.id ?? value?.ID);
  const width = normalizePositiveNumber(value?.width);
  const height = normalizePositiveNumber(value?.height);

  return {
    id: id ? Math.round(id) : null,
    url,
    width: width ? Math.round(width) : null,
    height: height ? Math.round(height) : null,
    alt: normalizeTrimmedString(value?.alt || ""),
  };
}

function normalizePageSeo(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const title = normalizeTrimmedString(value.title || "");
  const description = normalizeTrimmedString(value.description || "");
  const image = normalizeSeoImage(value.image);

  if (!title && !description && !image) {
    return null;
  }

  return {
    title,
    description,
    image,
  };
}

function normalizeFlexiblePagePayload(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  return {
    ...value,
    seo: normalizePageSeo(value.seo),
  };
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function isLocalImgCacheUrl(value) {
  return typeof value === "string" && value.startsWith("/img-cache/");
}

function isLocalPdfUrl(value) {
  return typeof value === "string" && value.startsWith("/pdf/");
}

function hasUsableImageUrl(value) {
  const url = pickStructuredUrl(value);
  return isHttpUrl(url) || isLocalImgCacheUrl(url);
}

function getAssetFetchHeaders(url) {
  if (!AUTH || !isHttpUrl(url)) return {};

  try {
    const target = new URL(url);
    const wpBaseUrl = new URL(WP_BASE);

    if (normalizeHost(target.hostname) === normalizeHost(wpBaseUrl.hostname)) {
      return authHeaders();
    }
  } catch {}

  return {};
}

function parseCloudflarePosterInfo(streamUrl) {
  if (!isHttpUrl(streamUrl)) return null;

  try {
    const url = new URL(streamUrl.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    const manifestIndex = parts.indexOf("manifest");
    const videoId = manifestIndex > 0 ? parts[manifestIndex - 1] : parts[0];

    if (!videoId) return null;

    return {
      videoId,
      posterUrl: `${url.protocol}//${url.host}/${videoId}/thumbnails/thumbnail.jpg`,
    };
  } catch {
    return null;
  }
}

async function probeImageDimensions(filePath) {
  try {
    const { stdout } = await execFileP("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      filePath,
    ]);
    const parsed = JSON.parse(stdout);
    const stream = parsed?.streams?.[0];
    const width = normalizePositiveNumber(stream?.width);
    const height = normalizePositiveNumber(stream?.height);

    if (!width || !height) {
      return null;
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  } catch {
    return null;
  }
}

function buildCloudflarePosterVariants(videoId, streamUrl, outputDir) {
  const safeVideoId =
    String(videoId || "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "cf-video";

  return CLOUDFLARE_FALLBACK_POSTER_VARIANTS.map(({ key, width }) => {
    const hash = crypto
      .createHash("md5")
      .update(`${streamUrl}|source=ffmpeg-first-frame|width=${width}`)
      .digest("hex")
      .slice(0, 8);
    const filename = `cf-video-${safeVideoId}-poster-${width}w-${hash}.webp`;

    return {
      key,
      width,
      filename,
      publicUrl: `/img-cache/${filename}`,
      localPath: path.join(outputDir, filename),
    };
  });
}

async function captureCloudflareFirstFrame(streamUrl, outputPath) {
  if (fs.existsSync(outputPath)) {
    return;
  }

  await execFileP("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    streamUrl,
    "-frames:v",
    "1",
    outputPath,
  ]);
}

async function generatePosterVariant(inputPath, variant) {
  if (fs.existsSync(variant.localPath)) {
    return;
  }

  const tempPng = path.join(
    path.dirname(variant.localPath),
    `${path.basename(variant.localPath, ".webp")}.tmp.png`
  );

  try {
    await execFileP("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-vf",
      `scale='min(iw,${variant.width})':-2:flags=lanczos`,
      "-frames:v",
      "1",
      tempPng,
    ]);
    await execFileP(cwebp, [tempPng, "-q", "100", "-o", variant.localPath]);
  } finally {
    if (fs.existsSync(tempPng)) {
      fs.unlinkSync(tempPng);
    }
  }
}

async function buildCloudflarePosterFallback(streamUrl, _outputDir) {
  const posterInfo = parseCloudflarePosterInfo(streamUrl);
  if (!posterInfo) return null;

  const { videoId } = posterInfo;
  const variants = buildCloudflarePosterVariants(videoId, streamUrl, _outputDir);
  const missingVariants = variants.filter((variant) => !fs.existsSync(variant.localPath));

  if (missingVariants.length > 0) {
    const sourceHash = crypto
      .createHash("md5")
      .update(`${streamUrl}|source=ffmpeg-first-frame`)
      .digest("hex")
      .slice(0, 8);
    const tempInput = path.join(_outputDir, `cf-video-${videoId}-poster-source-${sourceHash}.png`);

    try {
      await captureCloudflareFirstFrame(streamUrl, tempInput);

      for (const variant of missingVariants) {
        try {
          await generatePosterVariant(tempInput, variant);
        } catch (error) {
          console.warn(
            `⚠️ Failed to generate Cloudflare poster ${variant.filename}:`,
            error?.message || error
          );
        }
      }
    } catch (error) {
      console.warn(
        `⚠️ Error creating Cloudflare poster fallback for ${videoId}:`,
        error?.message || error
      );
      return null;
    } finally {
      if (fs.existsSync(tempInput)) {
        fs.unlinkSync(tempInput);
      }
    }
  }

  const availableVariants = [];
  for (const variant of variants) {
    if (!fs.existsSync(variant.localPath)) continue;

    const dims = await probeImageDimensions(variant.localPath);
    availableVariants.push({
      ...variant,
      widthValue: dims?.width || variant.width,
      heightValue: dims?.height || null,
    });
  }

  if (!availableVariants.length) {
    return null;
  }

  const sizes = {};
  for (const variant of availableVariants) {
    sizes[variant.key] = variant.publicUrl;
    sizes[`${variant.key}-width`] = variant.widthValue;

    if (variant.heightValue) {
      sizes[`${variant.key}-height`] = variant.heightValue;
    }
  }

  const primaryVariant =
    availableVariants.find((variant) => variant.key === "intch_full") ||
    availableVariants.find((variant) => variant.key === "intch_xl") ||
    availableVariants[0];

  return {
    title: `cf-video-${videoId}-poster-fallback`,
    filename: primaryVariant.filename,
    url: primaryVariant.publicUrl,
    alt: "",
    mime_type: "image/webp",
    sizes,
  };
}

async function getCloudflarePosterFallback(streamUrl, outputDir, cache) {
  const cacheKey = normalizeTrimmedString(streamUrl);
  if (!cacheKey) return null;

  if (!cache.has(cacheKey)) {
    cache.set(cacheKey, buildCloudflarePosterFallback(cacheKey, outputDir));
  }

  return cache.get(cacheKey);
}

async function injectCloudflarePosterFallbacks(node, outputDir, cache = new Map()) {
  if (!node || typeof node !== "object") {
    return node;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      await injectCloudflarePosterFallbacks(item, outputDir, cache);
    }
    return node;
  }

  const streamUrl = normalizeTrimmedString(node.cf_stream_video);
  if (streamUrl && !hasUsableImageUrl(node.yt_img)) {
    const fallback = await getCloudflarePosterFallback(streamUrl, outputDir, cache);
    if (fallback) {
      node.yt_img = fallback;
    }
  }

  for (const value of Object.values(node)) {
    await injectCloudflarePosterFallbacks(value, outputDir, cache);
  }

  return node;
}

function normalizeFloorPlanAsset(value, { includeDimensions = false } = {}) {
  const url = pickStructuredUrl(value);
  if (!url) return null;

  const normalized = { url };

  if (value && typeof value === "object") {
    const id = Number(value.id ?? value.ID ?? 0);
    if (Number.isInteger(id) && id > 0) {
      normalized.id = id;
    }

    const title = normalizeTrimmedString(value.title);
    if (title) {
      normalized.title = title;
    }

    const filename = normalizeTrimmedString(value.filename);
    if (filename) {
      normalized.filename = filename;
    }

    const mimeType = normalizeTrimmedString(value.mime_type ?? value.mimeType);
    if (mimeType) {
      normalized.mime_type = mimeType;
    }

    const subtype = normalizeTrimmedString(value.subtype);
    if (subtype) {
      normalized.subtype = subtype;
    }

    const filesize = normalizePositiveNumber(value.filesize);
    if (filesize) {
      normalized.filesize = filesize;
    }

    if (includeDimensions) {
      const width = normalizePositiveNumber(value.width);
      const height = normalizePositiveNumber(value.height);

      if (width) {
        normalized.width = width;
      }

      if (height) {
        normalized.height = height;
      }
    }
  }

  return normalized;
}

function normalizeFloorPlanDetailRow(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const unit = normalizeTrimmedString(row.unit ?? row.unitNumber);
  const floorPlanKeyplan = normalizeFloorPlanAsset(
    row.floor_plan_keyplan ?? row.floorPlanKeyplan,
    { includeDimensions: true }
  );
  const floorPlanImage = normalizeFloorPlanAsset(
    row.floor_plan_image ?? row.floorPlanImage,
    { includeDimensions: true }
  );
  const floorPlanPdf = normalizeFloorPlanAsset(
    row.floor_plan_pdf ?? row.floorPlanPdf ?? row.pdf ?? row.pdf_url ?? row.pdfUrl
  );
  const exterior =
    [
      row.exterior,
      row.exterior_square_footage,
      row.exteriorSquareFootage,
      row.exterior_sq_ft,
      row.exteriorSqFt,
    ]
      .map(normalizeTrimmedString)
      .find(Boolean) || "";

  const normalized = {};

  if (unit) {
    normalized.unit = unit;
  }

  if (floorPlanKeyplan) {
    normalized.floor_plan_keyplan = floorPlanKeyplan;
  }

  if (floorPlanImage) {
    normalized.floor_plan_image = floorPlanImage;
  }

  if (floorPlanPdf) {
    normalized.floor_plan_pdf = floorPlanPdf;
  }

  if (exterior) {
    normalized.exterior = exterior;
  }

  return Object.keys(normalized).length ? normalized : null;
}

function normalizeFloorPlanDetailPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const rows = Array.isArray(source.floor_plan_detail) ? source.floor_plan_detail : [];

  return {
    ...source,
    floor_plan_detail: rows.map(normalizeFloorPlanDetailRow).filter(Boolean),
  };
}

function buildFloorPlanPdfFilename(asset) {
  const sourceUrl = pickStructuredUrl(asset);
  let sourceFilename = "";

  if (sourceUrl) {
    try {
      sourceFilename = decodeUrlPathSegment(path.basename(new URL(sourceUrl).pathname));
    } catch {
      sourceFilename = "";
    }
  }

  const rawFilename =
    normalizeTrimmedString(asset?.filename) ||
    sourceFilename ||
    normalizeTrimmedString(asset?.title) ||
    "floor-plan";
  const rawExt = path.extname(rawFilename);
  const rawStem = rawExt ? path.basename(rawFilename, rawExt) : rawFilename;
  const cleanStem = sanitizeImportedMediaBasename(rawStem).toLowerCase() || "floor-plan";
  const hash = crypto
    .createHash("md5")
    .update(sourceUrl || JSON.stringify(asset))
    .digest("hex")
    .slice(0, 8);

  return `floorplan-${cleanStem}-${hash}.pdf`;
}

async function downloadFloorPlanPdf(asset, outputDir) {
  const rawUrl = pickStructuredUrl(asset);
  if (!rawUrl) return null;

  try {
    if (isLocalPdfUrl(rawUrl)) {
      return rawUrl;
    }

    let processUrl = rawUrl;
    if (!isHttpUrl(processUrl) && processUrl.startsWith("/")) {
      processUrl = new URL(processUrl, WP_BASE).toString();
    }

    if (!isHttpUrl(processUrl)) {
      return null;
    }

    const filename = buildFloorPlanPdfFilename({
      ...(asset && typeof asset === "object" ? asset : {}),
      url: processUrl,
    });
    const localPath = path.join(outputDir, filename);
    const publicUrl = `/pdf/${filename}`;

    if (fs.existsSync(localPath)) {
      return publicUrl;
    }

    const res = await fetch(processUrl, {
      headers: { ...getAssetFetchHeaders(processUrl) },
    });
    if (!res.ok) {
      console.warn(`⚠️ Failed to download floor plan PDF ${processUrl} (${res.status})`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    console.log(`📄 Cached floor plan PDF: ${filename}`);

    return publicUrl;
  } catch (error) {
    console.warn(`⚠️ Error processing floor plan PDF ${rawUrl}:`, error?.message || error);
    return null;
  }
}

async function cacheFloorPlanDetailPdfs(data, pdfDir) {
  const source = data && typeof data === "object" ? data : {};
  const rows = Array.isArray(source.floor_plan_detail) ? source.floor_plan_detail : [];
  const pdfUrlCache = new Map();
  const localizedPdfUrls = new Set();

  const localizedRows = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      localizedRows.push(row);
      continue;
    }

    const floorPlanPdf = normalizeFloorPlanAsset(
      row.floor_plan_pdf ?? row.floorPlanPdf ?? row.pdf ?? row.pdf_url ?? row.pdfUrl
    );

    if (!floorPlanPdf?.url) {
      localizedRows.push(row);
      continue;
    }

    let localizedUrl = pdfUrlCache.get(floorPlanPdf.url);
    if (localizedUrl === undefined) {
      localizedUrl = await downloadFloorPlanPdf(floorPlanPdf, pdfDir);
      pdfUrlCache.set(floorPlanPdf.url, localizedUrl ?? null);
    }

    const nextUrl = localizedUrl || floorPlanPdf.url;
    if (localizedUrl && localizedUrl !== floorPlanPdf.url) {
      localizedPdfUrls.add(localizedUrl);
    }

    localizedRows.push({
      ...row,
      floor_plan_pdf: {
        ...floorPlanPdf,
        url: nextUrl,
      },
    });
  }

  return {
    data: {
      ...source,
      floor_plan_detail: localizedRows,
    },
    transformedPdfCount: localizedPdfUrls.size,
  };
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
                  value: c.value,
                  isSelected:
                    !!c.isSelected ||
                    (
                      Number(form.id) === 1 &&
                      Number(f.id) === 13 &&
                      c.value === "Yes, send me updates"
                    )
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

async function fetchFloorplanDisclaimer() {
  const url = new URL("/wp-json/astro/v1/floorplan-disclaimer", WP_BASE);
  const { json } = await fetchJSON(url);
  return json;
}

async function fetchHideLanguage() {
  const url = new URL("/wp-json/astro/v1/hide-language", WP_BASE);
  const { json } = await fetchJSON(url);

  return {
    hide_language: !!json?.hide_language,
  };
}

async function fetchSocialMedia() {
  const url = new URL("/wp-json/astro/v1/social-media", WP_BASE);
  const { json } = await fetchJSON(url);
  return json;
}

async function fetchNetlifyImportMedia() {
  const url = new URL("/wp-json/astro/v1/netlify-import-media", WP_BASE);
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

    if (isLocalImgCacheUrl(processUrl)) {
      return processUrl;
    }

    if (!isHttpUrl(processUrl)) {
      return null;
    }

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
    const res = await fetch(processUrl, {
      headers: { ...getAssetFetchHeaders(processUrl) },
    });
    if (!res.ok) {
      console.warn(`⚠️ Failed to download ${processUrl} (${res.status})`);
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
    const directUrl = obj.url.trim();
    
    // A. Add Full Size (always)
    if (!isLocalImgCacheUrl(directUrl) && directUrl.match(/\.(jpeg|jpg|png|webp|gif|svg)(?:[?#].*)?$/i)) {
      collected.add(JSON.stringify({ url: directUrl, isPanorama }));
    }

    // B. Check 'sizes' for intch_ candidates
    if (obj.sizes && typeof obj.sizes === 'object') {
      for (const [key, val] of Object.entries(obj.sizes)) {
        if (key.startsWith('intch_')) {
          if (typeof val === 'string' && !isLocalImgCacheUrl(val)) {
            collected.add(JSON.stringify({ url: val, isPanorama }));
          } 
          else if (
            val &&
            typeof val === 'object' &&
            typeof val.url === 'string' &&
            !isLocalImgCacheUrl(val.url)
          ) {
            collected.add(JSON.stringify({ url: val.url, isPanorama }));
          }
          else if (
            val &&
            typeof val === 'object' &&
            typeof val.source_url === 'string' &&
            !isLocalImgCacheUrl(val.source_url)
          ) {
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

const IMG_CACHE_URL_PATTERN = /\/img-cache\/[A-Za-z0-9._-]+/g;
const PDF_URL_PATTERN = /\/pdf\/[A-Za-z0-9._-]+/g;
const IMG_CACHE_REFERENCE_FILE_EXTENSIONS = new Set([
  ".astro",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".ts",
  ".tsx",
]);
const GENERATED_FLOORPLAN_PDF_FILENAME_PATTERN = /^floorplan-.*-[0-9a-f]{8}\.pdf$/i;

function collectMatchingAssetUrlsFromText(text, pattern, keepUrls = new Set()) {
  if (typeof text !== "string" || !text) {
    return keepUrls;
  }

  const matches = text.match(pattern);
  if (!matches?.length) {
    return keepUrls;
  }

  for (const match of matches) {
    keepUrls.add(match);
  }

  return keepUrls;
}

function collectImgCacheUrlsFromText(text, keepUrls = new Set()) {
  return collectMatchingAssetUrlsFromText(text, IMG_CACHE_URL_PATTERN, keepUrls);
}

function collectPdfUrlsFromText(text, keepUrls = new Set()) {
  return collectMatchingAssetUrlsFromText(text, PDF_URL_PATTERN, keepUrls);
}

function walkFiles(dir, files = []) {
  if (!dir || !fs.existsSync(dir)) {
    return files;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectImgCacheUrlsFromFile(filePath, keepUrls = new Set()) {
  if (!filePath || !fs.existsSync(filePath)) {
    return keepUrls;
  }

  try {
    const text = fs.readFileSync(filePath, "utf8");
    return collectImgCacheUrlsFromText(text, keepUrls);
  } catch (error) {
    console.warn(`⚠️ Failed to scan ${filePath} for img-cache references: ${error?.message || error}`);
    return keepUrls;
  }
}

function collectPdfUrlsFromFile(filePath, keepUrls = new Set()) {
  if (!filePath || !fs.existsSync(filePath)) {
    return keepUrls;
  }

  try {
    const text = fs.readFileSync(filePath, "utf8");
    return collectPdfUrlsFromText(text, keepUrls);
  } catch (error) {
    console.warn(`⚠️ Failed to scan ${filePath} for PDF references: ${error?.message || error}`);
    return keepUrls;
  }
}

function parseUnitFloor(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;

  const floorDigits = digits.length > 2 ? digits.slice(0, -2) : digits;
  const floor = Number.parseInt(floorDigits, 10);
  return Number.isFinite(floor) ? floor : null;
}

function normalizeUnitNumber(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 3 ? digits : "";
}

function extractFilenameStem(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";

  const pathname = normalized.split(/[?#]/, 1)[0] ?? "";
  const filename = pathname.split("/").pop() ?? "";
  if (!filename) return "";

  const stem = filename.replace(/\.[^.]+$/i, "");
  return stem.replace(/-[0-9a-f]{8,}$/i, "");
}

function expandSharedUnitRange(startValue, endValue) {
  const start = normalizeUnitNumber(startValue);
  const end = normalizeUnitNumber(endValue);
  if (!start || !end) return [];

  const startFloor = parseUnitFloor(start);
  const endFloor = parseUnitFloor(end);
  const startSuffix = start.slice(-2);
  const endSuffix = end.slice(-2);

  if (startFloor === null || endFloor === null || startSuffix !== endSuffix) {
    return [];
  }

  const minFloor = Math.min(startFloor, endFloor);
  const maxFloor = Math.max(startFloor, endFloor);

  return Array.from({ length: maxFloor - minFloor + 1 }, (_, index) => {
    return `${minFloor + index}${startSuffix}`;
  });
}

function extractUnitKeysFromSpec(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return [];

  const matches = normalized.match(/\d{3,4}/g) ?? [];
  if (!matches.length) return [];

  if (matches.length === 2) {
    const expanded = expandSharedUnitRange(matches[0], matches[1]);
    if (expanded.length) {
      return expanded;
    }
  }

  return [...new Set(matches.map((match) => normalizeUnitNumber(match)).filter(Boolean))];
}

function getFloorPlanDetailUnitKeys(detail) {
  const candidates = [
    detail?.floor_plan_image?.filename,
    detail?.floor_plan_image?.title,
    detail?.floor_plan_image?.url,
    detail?.unit,
    detail?.unitNumber,
  ];

  for (const candidate of candidates) {
    const keys = extractUnitKeysFromSpec(candidate);
    if (keys.length) {
      return keys;
    }
  }

  return [];
}

function collectFallbackKeyplanUrls(detailFilePath, imgCacheDir, keepUrls = new Set()) {
  if (!detailFilePath || !imgCacheDir || !fs.existsSync(detailFilePath) || !fs.existsSync(imgCacheDir)) {
    return keepUrls;
  }

  let detailJson;
  try {
    detailJson = JSON.parse(fs.readFileSync(detailFilePath, "utf8"));
  } catch (error) {
    console.warn(`⚠️ Failed to parse ${detailFilePath} for key plan cleanup: ${error?.message || error}`);
    return keepUrls;
  }

  const detailRows = Array.isArray(detailJson?.floor_plan_detail) ? detailJson.floor_plan_detail : [];
  const activeUnits = new Set();

  for (const detail of detailRows) {
    for (const unit of getFloorPlanDetailUnitKeys(detail)) {
      activeUnits.add(unit);
    }
  }

  if (!activeUnits.size) {
    return keepUrls;
  }

  const fallbackKeyplanByUnit = new Map();

  for (const entry of fs.readdirSync(imgCacheDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^key-plan-.*\.svg$/i.test(entry.name)) {
      continue;
    }

    const unitKeys = extractUnitKeysFromSpec(extractFilenameStem(entry.name));
    if (!unitKeys.length) {
      continue;
    }

    const url = `/img-cache/${entry.name}`;

    for (const unit of unitKeys) {
      if (!activeUnits.has(unit) || fallbackKeyplanByUnit.has(unit)) {
        continue;
      }

      fallbackKeyplanByUnit.set(unit, url);
    }
  }

  for (const url of fallbackKeyplanByUnit.values()) {
    keepUrls.add(url);
  }

  return keepUrls;
}

function buildReferencedImgCacheUrls({
  wpContentDir,
  sourceDir,
  prefetchMapFile,
  floorPlanDetailFile,
  imgCacheDir,
}) {
  const keepUrls = new Set();

  for (const filePath of walkFiles(wpContentDir)) {
    if (!IMG_CACHE_REFERENCE_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      continue;
    }

    collectImgCacheUrlsFromFile(filePath, keepUrls);
  }

  for (const filePath of walkFiles(sourceDir)) {
    if (!IMG_CACHE_REFERENCE_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      continue;
    }

    collectImgCacheUrlsFromFile(filePath, keepUrls);
  }

  collectImgCacheUrlsFromFile(prefetchMapFile, keepUrls);
  collectFallbackKeyplanUrls(floorPlanDetailFile, imgCacheDir, keepUrls);

  return keepUrls;
}

function buildReferencedPdfUrls({ wpContentDir, sourceDir }) {
  const keepUrls = new Set();

  for (const filePath of walkFiles(wpContentDir)) {
    if (!IMG_CACHE_REFERENCE_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      continue;
    }

    collectPdfUrlsFromFile(filePath, keepUrls);
  }

  for (const filePath of walkFiles(sourceDir)) {
    if (!IMG_CACHE_REFERENCE_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      continue;
    }

    collectPdfUrlsFromFile(filePath, keepUrls);
  }

  return keepUrls;
}

function cleanupImgCacheDirectory(imgCacheDir, keepUrls) {
  if (!imgCacheDir || !fs.existsSync(imgCacheDir)) {
    return { scanned: 0, kept: 0, deleted: 0, referenced: 0, skipped: false };
  }

  const keepFilenames = new Set(
    Array.from(keepUrls)
      .map((url) => path.basename(url))
      .filter(Boolean)
  );

  if (!keepFilenames.size) {
    console.warn("⚠️ Img cache cleanup skipped because no live references were detected.");
    return { scanned: 0, kept: 0, deleted: 0, referenced: 0, skipped: true };
  }

  let scanned = 0;
  let kept = 0;
  let deleted = 0;

  for (const entry of fs.readdirSync(imgCacheDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    scanned++;

    if (keepFilenames.has(entry.name)) {
      kept++;
      continue;
    }

    fs.unlinkSync(path.join(imgCacheDir, entry.name));
    deleted++;
    console.log(`🧹 Removed stale img-cache asset: ${entry.name}`);
  }

  return {
    scanned,
    kept,
    deleted,
    referenced: keepFilenames.size,
    skipped: false,
  };
}

function cleanupGeneratedFloorPlanPdfDirectory(pdfDir, keepUrls) {
  if (!pdfDir || !fs.existsSync(pdfDir)) {
    return { scanned: 0, kept: 0, deleted: 0, referenced: 0, skipped: false };
  }

  const keepFilenames = new Set(
    Array.from(keepUrls)
      .map((url) => path.basename(url))
      .filter(Boolean)
  );

  if (!keepFilenames.size) {
    console.warn("⚠️ Floor plan PDF cleanup skipped because no live references were detected.");
    return { scanned: 0, kept: 0, deleted: 0, referenced: 0, skipped: true };
  }

  let scanned = 0;
  let kept = 0;
  let deleted = 0;

  for (const entry of fs.readdirSync(pdfDir, { withFileTypes: true })) {
    if (!entry.isFile() || !GENERATED_FLOORPLAN_PDF_FILENAME_PATTERN.test(entry.name)) {
      continue;
    }

    scanned++;

    if (keepFilenames.has(entry.name)) {
      kept++;
      continue;
    }

    fs.unlinkSync(path.join(pdfDir, entry.name));
    deleted++;
    console.log(`🧹 Removed stale floor plan PDF: ${entry.name}`);
  }

  return {
    scanned,
    kept,
    deleted,
    referenced: keepFilenames.size,
    skipped: false,
  };
}

function inferFileExtensionFromMimeType(mimeType) {
  const normalized = normalizeTrimmedString(mimeType).toLowerCase();
  if (!normalized) return "";
  if (normalized === "application/pdf") return ".pdf";
  if (normalized === "image/png") return ".png";
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/svg+xml") return ".svg";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/gif") return ".gif";
  return "";
}

function decodeUrlPathSegment(value) {
  try {
    return decodeURIComponent(String(value ?? ""));
  } catch {
    return String(value ?? "");
  }
}

function sanitizeImportedMediaBasename(value) {
  const sanitized = String(value ?? "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

  return sanitized || "media";
}

function sanitizeImportedMediaExtension(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";

  const sanitized = normalized.replace(/[^A-Za-z0-9.]+/g, "");
  if (!sanitized) return "";

  return sanitized.startsWith(".") ? sanitized : `.${sanitized}`;
}

function normalizeNetlifyImportMediaItem(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawUrl = pickStructuredUrl(value);
  let url = rawUrl;

  if (url && !isHttpUrl(url) && url.startsWith("/")) {
    try {
      url = new URL(url, WP_BASE).toString();
    } catch {
      url = "";
    }
  }

  if (!isHttpUrl(url)) {
    return null;
  }

  const id = normalizePositiveNumber(value?.id ?? value?.ID);
  const width = normalizePositiveNumber(value?.width);
  const height = normalizePositiveNumber(value?.height);
  const mimeType =
    normalizeTrimmedString(value?.mime_type ?? value?.mimeType ?? value?.type) ||
    inferImageMimeType(url) ||
    "";

  return {
    id: id ? Math.round(id) : null,
    title: normalizeTrimmedString(value?.title || value?.name || ""),
    url,
    alt: normalizeTrimmedString(value?.alt || ""),
    caption: normalizeTrimmedString(value?.caption || ""),
    description: normalizeTrimmedString(value?.description || ""),
    mime_type: mimeType,
    width: width ? Math.round(width) : null,
    height: height ? Math.round(height) : null,
    source_filename: normalizeTrimmedString(value?.filename || ""),
  };
}

function normalizeNetlifyImportMediaPayload(value) {
  const itemsSource = Array.isArray(value)
    ? value
    : Array.isArray(value?.items)
      ? value.items
      : [];

  const items = itemsSource
    .map(normalizeNetlifyImportMediaItem)
    .filter(Boolean);

  return {
    count: items.length,
    items,
  };
}

function buildManagedNetlifyImportMediaMaps(manifest) {
  const items = Array.isArray(manifest?.items) ? manifest.items : [];
  const byId = new Map();
  const byUrl = new Map();
  const managedFilenames = new Set();

  for (const item of items) {
    const id = Number(item?.id || 0);
    const url = normalizeTrimmedString(item?.url);
    const filename = normalizeTrimmedString(item?.filename);

    if (id > 0) {
      byId.set(id, item);
    }

    if (url) {
      byUrl.set(url, item);
    }

    if (filename) {
      managedFilenames.add(filename);
    }
  }

  return { byId, byUrl, managedFilenames };
}

function buildNetlifyImportMediaFilename(
  item,
  outputDir,
  usedFilenames,
  previousMaps,
  previousItem
) {
  const previousFilename = normalizeTrimmedString(previousItem?.filename);
  if (previousFilename && !usedFilenames.has(previousFilename)) {
    return previousFilename;
  }

  let rawFilename = normalizeTrimmedString(item?.source_filename);

  if (!rawFilename) {
    try {
      rawFilename = decodeUrlPathSegment(path.basename(new URL(item.url).pathname));
    } catch {
      rawFilename = "";
    }
  }

  let extension = sanitizeImportedMediaExtension(path.extname(rawFilename));
  if (!extension) {
    extension = sanitizeImportedMediaExtension(inferFileExtensionFromMimeType(item?.mime_type));
  }

  const rawBasename = rawFilename
    ? path.basename(rawFilename, path.extname(rawFilename))
    : normalizeTrimmedString(item?.title) || `media-${item?.id || "file"}`;
  const basename = sanitizeImportedMediaBasename(rawBasename);
  const uniqueSuffix =
    item?.id ||
    crypto.createHash("md5").update(item.url).digest("hex").slice(0, 8);

  let attempt = 0;

  while (true) {
    const candidate =
      attempt === 0
        ? `${basename}${extension}`
        : `${basename}-${uniqueSuffix}${attempt > 1 ? `-${attempt}` : ""}${extension}`;
    const destinationFile = path.join(outputDir, candidate);
    const collidesWithUnmanagedFile =
      fs.existsSync(destinationFile) && !previousMaps.managedFilenames.has(candidate);

    if (!usedFilenames.has(candidate) && !collidesWithUnmanagedFile) {
      return candidate;
    }

    attempt += 1;
  }
}

async function downloadNetlifyImportMediaFile(url, destinationFile) {
  const res = await fetch(url, {
    headers: { ...getAssetFetchHeaders(url) },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${url}\n${text.slice(0, 400)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destinationFile), { recursive: true });
  fs.writeFileSync(destinationFile, buffer);

  return buffer.length;
}

function cleanupManagedNetlifyImportMediaFiles(outputDir, keepFilenames, previousManifest) {
  const previousItems = Array.isArray(previousManifest?.items) ? previousManifest.items : [];
  let deleted = 0;

  for (const item of previousItems) {
    const filename = normalizeTrimmedString(item?.filename);
    if (!filename || keepFilenames.has(filename)) {
      continue;
    }

    const filePath = path.join(outputDir, filename);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    fs.unlinkSync(filePath);
    deleted += 1;
    console.log(`🧹 Removed stale imported media: ${filename}`);
  }

  return {
    deleted,
    referenced: keepFilenames.size,
  };
}

async function syncNetlifyImportMediaAssets(payload, outputDir, previousManifest) {
  const normalized = normalizeNetlifyImportMediaPayload(payload);
  const previousMaps = buildManagedNetlifyImportMediaMaps(previousManifest);
  const usedFilenames = new Set();
  const items = [];

  for (const item of normalized.items) {
    const previousItem =
      (item.id ? previousMaps.byId.get(item.id) : null) ||
      previousMaps.byUrl.get(item.url) ||
      null;
    const filename = buildNetlifyImportMediaFilename(
      item,
      outputDir,
      usedFilenames,
      previousMaps,
      previousItem
    );
    const destinationFile = path.join(outputDir, filename);

    await downloadNetlifyImportMediaFile(item.url, destinationFile);

    usedFilenames.add(filename);
    items.push({
      ...item,
      filename,
      public_url: `/images/${filename}`,
    });
  }

  const cleanup = cleanupManagedNetlifyImportMediaFiles(
    outputDir,
    usedFilenames,
    previousManifest
  );

  return {
    manifest: {
      count: items.length,
      items,
    },
    cleanup,
  };
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
function getLayoutName(row) {
  return row?.name || row?.acf_fc_layout || "";
}

function isFullWidthFullBleedRow(row) {
  return (
    getLayoutName(row) === "full_bleed_img" &&
    normalizeTrimmedString(row?.width).toLowerCase() === "full"
  );
}

function normalizeResponsiveBreakpointValue(value) {
  const numeric = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function inferImageMimeType(url) {
  const normalized = normalizeTrimmedString(url).split("?")[0].toLowerCase();
  if (!normalized) return undefined;
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".png")) return "image/png";
  return undefined;
}

function parseSrcSetCandidates(rawSrcSet) {
  return String(rawSrcSet || "")
    .split(",")
    .map((part) => {
      const pieces = part.trim().split(/\s+/);
      return {
        url: pieces[0] || null,
        w: pieces[1] || null,
      };
    })
    .filter((candidate) => candidate.url);
}

function buildWpImageLcpEntry(image, { sizesAttr = FULL_WIDTH_RESPONSIVE_SIZES, media } = {}) {
  if (!image || typeof image !== "object") return null;

  const sizes = image.sizes || {};
  const fallbackUrl = image.url || image.sourceUrl || image.src || null;
  const candidates = [
    { url: sizes.intch_xl || fallbackUrl, w: sizes["intch_xl-width"] },
    { url: sizes.intch_lg || fallbackUrl, w: sizes["intch_lg-width"] },
    { url: sizes.intch_med || fallbackUrl, w: sizes["intch_med-width"] },
    { url: sizes.intch_sm || fallbackUrl, w: sizes["intch_sm-width"] },
  ]
    .filter((candidate) => candidate.url)
    .map((candidate) => ({
      url: candidate.url,
      w: candidate.w ? `${candidate.w}w` : null,
    }));

  if (candidates.length === 0 && fallbackUrl) {
    candidates.push({ url: fallbackUrl, w: null });
  }

  if (candidates.length === 0) return null;

  return {
    href: candidates[0].url,
    imagesrcset: candidates.filter((candidate) => candidate.w).map((candidate) => `${candidate.url} ${candidate.w}`).join(", ") || undefined,
    imagesizes: sizesAttr,
    media,
    type: inferImageMimeType(candidates[0].url),
  };
}

function getCarouselImageData(item) {
  if (typeof item === "string") {
    return { url: item };
  }

  if (typeof item?.image === "string") {
    return { url: item.image };
  }

  if (item?.image && typeof item.image === "object") {
    return item.image;
  }

  if (item && typeof item === "object" && (item.url || item.src || item.sizes)) {
    return item;
  }

  return null;
}

function getRawLcpImage(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const firstRow = rows[0] || null;
  const secondRow = rows[1] || null;

  if (getLayoutName(firstRow) === "page_title" && getLayoutName(secondRow) === "carousel") {
    const carouselItems = Array.isArray(secondRow.images)
      ? secondRow.images.slice(0, CRITICAL_CAROUSEL_IMAGE_COUNT)
      : [];

    const carouselEntries = carouselItems.flatMap((item) => {
      const image = getCarouselImageData(item);
      if (!image) return [];

      const mediumHref = normalizeTrimmedString(image?.sizes?.intch_med);
      const largeHref = normalizeTrimmedString(image?.sizes?.intch_lg);
      const fallbackHref = normalizeTrimmedString(image?.url || image?.src);

      if (mediumHref && largeHref) {
        return [
          {
            href: mediumHref,
            media: `(max-width: ${CAROUSEL_MOBILE_BREAKPOINT}px)`,
            type: inferImageMimeType(mediumHref),
          },
          {
            href: largeHref,
            media: `(min-width: ${CAROUSEL_DESKTOP_BREAKPOINT}px)`,
            type: inferImageMimeType(largeHref),
          },
        ];
      }

      const href = largeHref || mediumHref || fallbackHref;
      return href
        ? [{ href, type: inferImageMimeType(href) }]
        : [];
    });

    return carouselEntries.length > 0 ? carouselEntries : null;
  }

  const targetRow =
    isFullWidthFullBleedRow(firstRow)
      ? firstRow
      : getLayoutName(firstRow) === "splash_video" && isFullWidthFullBleedRow(secondRow)
        ? secondRow
        : firstRow;
  const isFullWidthTarget = isFullWidthFullBleedRow(targetRow);
  const directVideo = targetRow?.video || targetRow?.data?.video;

  if (Array.isArray(directVideo) && directVideo[0]?.yt_img) {
    const videoObj = directVideo[0];
    const sizesAttr = isFullWidthTarget ? FULL_WIDTH_RESPONSIVE_SIZES : HERO_RESPONSIVE_SIZES;
    const desktopEntry = buildWpImageLcpEntry(videoObj.yt_img, { sizesAttr });
    const mobileEntry =
      isFullWidthTarget && videoObj.yt_img_mob
        ? buildWpImageLcpEntry(videoObj.yt_img_mob, {
            sizesAttr,
            media: (() => {
              const breakpoint = normalizeResponsiveBreakpointValue(videoObj.mob_img_breakpoint);
              return breakpoint ? `(max-width: ${breakpoint}px)` : undefined;
            })(),
          })
        : null;
    const mobileBreakpoint = normalizeResponsiveBreakpointValue(videoObj.mob_img_breakpoint);

    if (mobileEntry && desktopEntry && mobileBreakpoint) {
      desktopEntry.media = `(min-width: ${mobileBreakpoint + 1}px)`;
      return [mobileEntry, desktopEntry];
    }

    if (desktopEntry) return desktopEntry;
    if (mobileEntry) return mobileEntry;
  }

  if (Array.isArray(targetRow?.images) && targetRow.images.length > 0) {
    const firstImg = targetRow.images[0];
    if (firstImg && firstImg.video) {
      const nestedResult = getRawLcpImage([
        {
          video: firstImg.video,
        },
      ]);
      if (nestedResult) return nestedResult;
    }
  }

  const imageKeys = ["image", "hero_image", "background_image", "bg_image", "mobile_image", "desktop_image"];
  const dataSource = targetRow?.data || targetRow || {};

  for (const key of imageKeys) {
    if (dataSource[key] && typeof dataSource[key] === "object") {
      const img = dataSource[key];
      const src = img.url || img.sourceUrl || img.src;
      if (!src) continue;

      const rawSrcSet = img.srcset || img.srcSet;
      if (rawSrcSet) {
        const candidates = parseSrcSetCandidates(rawSrcSet);
        return {
          href: candidates[0]?.url || src,
          imagesrcset: candidates.map((candidate) => `${candidate.url}${candidate.w ? ` ${candidate.w}` : ""}`).join(", "),
          imagesizes: FULL_WIDTH_RESPONSIVE_SIZES,
          type: inferImageMimeType(candidates[0]?.url || src),
        };
      }

      return {
        href: src,
        imagesizes: FULL_WIDTH_RESPONSIVE_SIZES,
        type: inferImageMimeType(src),
      };
    }
  }

  return null;
}

function localizeLcpEntry(entry, urlMap) {
  if (!entry || typeof entry !== "object") return null;

  const localizedHref = normalizeTrimmedString(urlMap.get(entry.href) || entry.href);
  const localizedCandidates = parseSrcSetCandidates(entry.imagesrcset)
    .map((candidate) => ({
      url: urlMap.get(candidate.url) || candidate.url,
      w: candidate.w,
    }))
    .filter((candidate) => candidate.url);
  const localizedSrcSet = localizedCandidates
    .map((candidate) => `${candidate.url}${candidate.w ? ` ${candidate.w}` : ""}`)
    .join(", ");

  const href = localizedHref || localizedCandidates[0]?.url || "";
  if (!href) return null;

  return {
    href,
    imagesrcset: localizedSrcSet || undefined,
    imagesizes: entry.imagesizes,
    media: entry.media,
    type: entry.type || inferImageMimeType(href),
  };
}

/* -------------------------------------------
   Main
------------------------------------------- */
async function run() {
  console.log("ENV:", { WP_BASE_URL: maskBasicAuthUrl(WP_BASE) });

  const srcDir = path.join(process.cwd(), "src");
  const outPages = path.join(process.cwd(), "src", "content", "wp", "pages");
  const wpContentDir = path.join(process.cwd(), "src", "content", "wp");
  const outFloorPlanDetail = path.join(process.cwd(), "src", "content", "wp", "floor-plan-detail.json");
  const outPanoramicViews = path.join(process.cwd(), "src", "content", "wp", "panoramic-views.json");
  const outFloorplanDisclaimer = path.join(process.cwd(), "src", "content", "wp", "floorplan-disclaimer.json");
  const outHideLanguage = path.join(process.cwd(), "src", "content", "wp", "hide-language.json");
  const outSocialMedia = path.join(process.cwd(), "src", "content", "wp", "social-media.json");
  const outNetlifyImportMedia = path.join(process.cwd(), "src", "content", "wp", "netlify-import-media.json");
  const outSpecials = path.join(process.cwd(), "src", "content", "wp", "specials.json");
  const outOrder = path.join(process.cwd(), "src", "content", "wp", "page-order.json"); 
  const outHeaderMenu = path.join(process.cwd(), "src", "content", "wp", "header-menu.json");
  const outHeaderMenuCN = path.join(process.cwd(), "src", "content", "wp", "header-menu-cn.json");
  const outAvesdoFloorplans = path.join(process.cwd(), "src", "content", "wp", "avesdo-floorplans.json");
  const publicDir = path.join(process.cwd(), "public");
  const publicImagesDir = path.join(publicDir, "images");
  const pdfDir = path.join(publicDir, "pdf");
  const outSchemaAddress = path.join(process.cwd(), "src", "content", "wp", "schema-address.json");
  const imgCacheDir = path.join(publicDir, "img-cache");

  fs.mkdirSync(outPages, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(publicImagesDir, { recursive: true });
  fs.mkdirSync(pdfDir, { recursive: true });
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
    const normalizedFloorPlanDetail = normalizeFloorPlanDetailPayload(floorPlanDetail);
    const transformed = await cacheStructuredDataImages(normalizedFloorPlanDetail, imgCacheDir);
    const localizedPdfs = await cacheFloorPlanDetailPdfs(transformed.data, pdfDir);

    writeJSONIfChanged(
      outFloorPlanDetail,
      localizedPdfs.data,
      `✨ Floor plan detail updated (${transformed.transformedImageCount} images transformed, ${localizedPdfs.transformedPdfCount} PDFs localized)`,
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

  /* -------- FLOORPLAN DISCLAIMER -------- */
  try {
    console.log("📝 Fetching Floorplan Disclaimer…");
    const floorplanDisclaimer = await fetchFloorplanDisclaimer();

    writeJSONIfChanged(
      outFloorplanDisclaimer,
      floorplanDisclaimer,
      "✨ Floorplan disclaimer updated",
      "⏩ Floorplan disclaimer unchanged — skip write"
    );
  } catch (error) {
    console.error(`❌ Failed to sync Floorplan Disclaimer: ${error?.message || error}`);
  }

  /* -------- HIDE LANGUAGE -------- */
  try {
    console.log("🌐 Fetching Hide Language flag…");
    const hideLanguage = await fetchHideLanguage();

    writeJSONIfChanged(
      outHideLanguage,
      hideLanguage,
      "✨ Hide language flag updated",
      "⏩ Hide language flag unchanged — skip write"
    );
  } catch (error) {
    console.error(`❌ Failed to sync Hide Language flag: ${error?.message || error}`);
  }

  /* -------- SOCIAL MEDIA -------- */
  try {
    console.log("📱 Fetching Social Media…");
    const socialMedia = await fetchSocialMedia();
    const transformed = await cacheStructuredDataImages(socialMedia, imgCacheDir);

    writeJSONIfChanged(
      outSocialMedia,
      transformed.data,
      `✨ Social media updated (${transformed.transformedImageCount} images transformed)`,
      "⏩ Social media unchanged — skip write"
    );
  } catch (error) {
    console.error(`❌ Failed to sync Social Media: ${error?.message || error}`);
  }

  /* -------- NETLIFY IMPORT MEDIA -------- */
  try {
    console.log("📎 Fetching Netlify Import Media…");
    const netlifyImportMedia = await fetchNetlifyImportMedia();
    const previousNetlifyImportMedia = readJSONIfExists(outNetlifyImportMedia);
    const syncedNetlifyImportMedia = await syncNetlifyImportMediaAssets(
      netlifyImportMedia,
      publicImagesDir,
      previousNetlifyImportMedia
    );

    writeJSONIfChanged(
      outNetlifyImportMedia,
      syncedNetlifyImportMedia.manifest,
      `✨ Netlify import media updated (${syncedNetlifyImportMedia.manifest.count} files, stale removed=${syncedNetlifyImportMedia.cleanup.deleted})`,
      `⏩ Netlify import media unchanged (${syncedNetlifyImportMedia.manifest.count} files)`
    );
  } catch (error) {
    console.error(`❌ Failed to sync Netlify import media: ${error?.message || error}`);
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
  const cloudflarePosterFallbackCache = new Map();

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
        const normalizedData = normalizeFlexiblePagePayload(data);
        await injectCloudflarePosterFallbacks(
          normalizedData,
          imgCacheDir,
          cloudflarePosterFallbackCache
        );
        const layouts = Array.isArray(normalizedData?.layouts) ? normalizedData.layouts : [];

        const cleanPath = toPathname(uri);
        const pageTitle =
          normalizedData?.title?.rendered ||
          normalizedData?.title ||
          "Untitled Page";
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

        if (normalizedData?.seo) {
          recurseFindImages(normalizedData.seo, imageUrlStrings);
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
        const transformedData = replaceImageUrls(normalizedData, urlMap);

        // 4. Build Prefetch Map
        const firstRow = layouts[0] || null;
        const entry = { path: cleanPath };
        let hasEntry = false;

        // VIDEO
        const videoField = firstRow?.video || (firstRow?.data && firstRow.data.video);
        if (videoField && Array.isArray(videoField)) {
          const videoObj = videoField[0];
          if (videoObj && videoObj.cf_stream_video) {
            entry.video = videoObj.cf_stream_video;
            hasEntry = true;
          }
        }

        // LCP IMAGE
        const lcpData = getRawLcpImage(layouts);
        if (lcpData) {
          const localizedLcpEntries = (Array.isArray(lcpData) ? lcpData : [lcpData])
            .map((item) => localizeLcpEntry(item, urlMap))
            .filter(Boolean);

          if (localizedLcpEntries.length === 1) {
            entry.lcp = localizedLcpEntries[0];
            hasEntry = true;
          } else if (localizedLcpEntries.length > 1) {
            entry.lcp = localizedLcpEntries;
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
    await injectCloudflarePosterFallbacks(
      specials,
      imgCacheDir,
      cloudflarePosterFallbackCache
    );
    
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

  const referencedImgCacheUrls = buildReferencedImgCacheUrls({
    wpContentDir,
    sourceDir: srcDir,
    prefetchMapFile: mapFile,
    floorPlanDetailFile: outFloorPlanDetail,
    imgCacheDir,
  });
  const referencedPdfUrls = buildReferencedPdfUrls({
    wpContentDir,
    sourceDir: srcDir,
  });
  const pdfCleanupSummary = cleanupGeneratedFloorPlanPdfDirectory(pdfDir, referencedPdfUrls);
  console.log(
    `🧹 Floor plan PDF cleanup complete: scanned=${pdfCleanupSummary.scanned}, kept=${pdfCleanupSummary.kept}, deleted=${pdfCleanupSummary.deleted}, referenced=${pdfCleanupSummary.referenced}, skipped=${pdfCleanupSummary.skipped}`
  );
  const cleanupSummary = cleanupImgCacheDirectory(imgCacheDir, referencedImgCacheUrls);
  console.log(
    `🧹 Img cache cleanup complete: scanned=${cleanupSummary.scanned}, kept=${cleanupSummary.kept}, deleted=${cleanupSummary.deleted}, referenced=${cleanupSummary.referenced}, skipped=${cleanupSummary.skipped}`
  );

  console.log(`Sync complete: wrote=${wrote}, skipped=${skipped}, failed=${failed}`);
  console.log("---------------------------------------------------");
}

run().catch((e) => {
  console.error("🔥 Sync script crashed:", e);
  process.exit(1);
});
