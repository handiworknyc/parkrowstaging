import * as cheerio from "cheerio";
import { authHeaders } from "./env";

export type PreviewFlexiblePage = {
  kind?: string;
  id?: number;
  uri?: string;
  title?: string;
  layouts?: any[];
  _syncedAt?: string;
  [key: string]: unknown;
};

const WP_BASE = (import.meta.env.WP_BASE_URL || "").trim();

function normalizeUri(uri: string): string {
  let normalized = (uri || "/").trim();
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (!normalized.endsWith("/")) normalized = `${normalized}/`;
  return normalized;
}

function resolveWpUrl(raw: string): URL | null {
  if (!raw || !WP_BASE) return null;

  try {
    return new URL(raw, WP_BASE);
  } catch {
    return null;
  }
}

function isWpUploadUrl(raw: string): boolean {
  const candidate = resolveWpUrl(raw);
  const base = resolveWpUrl(WP_BASE);

  if (!candidate || !base) return false;
  if (candidate.hostname !== base.hostname) return false;

  return /\/wp-content\/uploads\//.test(candidate.pathname);
}

function toImageProxyUrl(raw: string): string {
  const candidate = resolveWpUrl(raw);
  if (!candidate || !isWpUploadUrl(raw)) return raw;
  return `/api/img?u=${encodeURIComponent(candidate.toString())}`;
}

function rewriteSrcset(value: string): string {
  return value
    .split(",")
    .map((part) => {
      const [url, descriptor] = part.trim().split(/\s+/, 2);
      if (!url) return part.trim();
      return [toImageProxyUrl(url), descriptor].filter(Boolean).join(" ");
    })
    .join(", ");
}

function rewriteHtmlMedia(value: string): string {
  if (!/<(?:img|source|video)\b/i.test(value)) return value;

  const $ = cheerio.load(value);

  $("[src]").each((_, el) => {
    const current = $(el).attr("src");
    if (current) $(el).attr("src", toImageProxyUrl(current));
  });

  $("[poster]").each((_, el) => {
    const current = $(el).attr("poster");
    if (current) $(el).attr("poster", toImageProxyUrl(current));
  });

  $("[srcset]").each((_, el) => {
    const current = $(el).attr("srcset");
    if (current) $(el).attr("srcset", rewriteSrcset(current));
  });

  return $.root().html() || value;
}

function rewritePreviewMedia<T>(value: T): T {
  if (typeof value === "string") {
    if (value.includes("/wp-content/uploads/")) {
      if (/<(?:img|source|video)\b/i.test(value)) {
        return rewriteHtmlMedia(value) as T;
      }

      if (value.includes(",") && /\s\d+[wx](?:,|$)/.test(value)) {
        return rewriteSrcset(value) as T;
      }

      return toImageProxyUrl(value) as T;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => rewritePreviewMedia(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, rewritePreviewMedia(entry)])
    ) as T;
  }

  return value;
}

async function fetchJson(url: URL): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...authHeaders(),
    },
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    const peek = (await res.text().catch(() => ""))?.slice(0, 300) || "";
    throw new Error(`Preview fetch failed: ${res.status} ${url}\n${peek}`);
  }

  return res.json();
}

export async function fetchPreviewFlexiblePageByUri(
  uri: string
): Promise<PreviewFlexiblePage | null> {
  if (!WP_BASE) {
    throw new Error("Missing WP_BASE_URL");
  }

  const url = new URL("/wp-json/astro/v1/flexible", WP_BASE);
  url.searchParams.set("uri", normalizeUri(uri));

  const payload = await fetchJson(url);
  if (!payload) return null;

  return rewritePreviewMedia(payload) as PreviewFlexiblePage;
}
