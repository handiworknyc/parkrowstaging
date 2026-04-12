// src/lib/api.js
import pageOrderManifest from "../content/wp/page-order.json";
import { fetchAPI } from "./wp.js";
import { getEnv, toBase64 } from "./env.ts"; // note .ts import is fine with Vite/TS

function authHeaders() {
  const pair = getEnv("WP_AUTH_BASIC");
  if (!pair) return {};
  const token = toBase64(pair);
  return token ? { Authorization: `Basic ${token}` } : {};
}

function getGraphQLEndpoint() {
  const wp = getEnv("WORDPRESS_API_URL");
  const base = getEnv("WP_BASE_URL");
  if (wp) return wp;
  if (base) return new URL("/graphql", base).toString();
  return null;
}

async function fetchGraphQL(query, variables) {
  const endpoint = getGraphQLEndpoint();
  if (!endpoint) return null;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();
  const ct = res.headers.get("content-type") || "";

  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status} at ${endpoint}\n${text.slice(0, 300)}`);
  if (!ct.includes("application/json")) throw new Error(`Expected JSON but got "${ct}" from ${endpoint}\n${text.slice(0, 300)}`);

  return JSON.parse(text);
}

// Resolve any URI to a WP node
export async function getNodeByURI(uri) {
  const q = `
    query GetNodeByURI($uri: String!) {
      nodeByUri(uri: $uri) {
        __typename
        ... on Project {
          id uri title content
          featuredImage { node { sourceUrl srcSet altText } }
          portfolioInfo { excerpt date link subtitle }
        }
        ... on Post {
          id uri title excerpt date content
          categories { nodes { name uri } }
          featuredImage { node { sourceUrl srcSet altText } }
        }
        ... on Page {
          id uri title content
          featuredImage { node { sourceUrl srcSet altText } }
        }
        ... on Category { id name uri }
        ... on Tag { id name uri }
      }
    }
  `;
  try {
    const json = await fetchGraphQL(q, { uri });
    return json?.data ?? null;
  } catch {
    return null;
  }
}

// Collect all URIs (kept as-is; ensure your route expects `params.uri`)
export async function getAllUris() {
  const q = `query GetAllUris {
    terms { nodes { uri } }
    posts(first: 100) { nodes { uri } }
    pages(first: 100) { nodes { uri } }
    projects(first: 100) { nodes { uri } }
  }`;

  try {
    const json = await fetchGraphQL(q);
    const data = json?.data || {};

    const allNodes = Object.values(data).reduce((acc, group) => {
      if (group?.nodes) acc = acc.concat(group.nodes);
      return acc;
    }, []);

    const uris = allNodes
      .filter((n) => n?.uri)
      .map((n) => {
        const trimmed = n.uri.replace(/^\/|\/$/g, "");
        return { params: { uri: trimmed } }; // <-- make sure your route param name matches this
      });

    return uris;
  } catch {
    return [];
  }
}

/* ===========================================
 * Flexible-content (file-based) helpers
 * =========================================== */

// Eagerly import JSON written by your sync script
const pageMods = import.meta.glob("/src/content/wp/pages/*.json", { eager: true });
// const serviceMods = import.meta.glob("/src/content/wp/tax/service/*.json", { eager: true });
// const serviceAreaMods = import.meta.glob("/src/content/wp/tax/service-area/*.json", { eager: true });

// Utilities
function normalizeUri(u) {
  let s = (u || "/").trim();
  if (!s.startsWith("/")) s = "/" + s;
  if (!s.endsWith("/")) s += "/";
  return s;
}

function slugParamFromUri(uri) {
  // Return a *string* param for Astro routes (not an array)
  return (uri || "").replace(/^\/|\/$/g, ""); // "service/foo/bar"
}

const PUBLISHED_PAGE_URIS = new Set(
  (Array.isArray(pageOrderManifest) ? pageOrderManifest : [])
    .map((page) => page?.uri)
    .filter(Boolean)
    .map(normalizeUri)
);

const LOCAL_DEV_PAGE_URIS = new Set([
  "/floor-plans/",
]);

function isPublishedPageUri(uri) {
  return PUBLISHED_PAGE_URIS.has(normalizeUri(uri));
}

function isLocalDevPageUri(uri) {
  return import.meta.env.DEV && LOCAL_DEV_PAGE_URIS.has(normalizeUri(uri));
}

function isVisiblePageUri(uri) {
  return isPublishedPageUri(uri) || isLocalDevPageUri(uri);
}

function indexByUri(mods) {
  const out = new Map();
  Object.values(mods).forEach((m) => {
    const data = m && m.default ? m.default : m;
    if (data && data.uri && isVisiblePageUri(data.uri)) {
      out.set(normalizeUri(data.uri), data);
    }
  });
  return out;
}

function listFromMods(mods) {
  const out = [];
  Object.values(mods).forEach((m) => {
    const data = m && m.default ? m.default : m;
    if (data) out.push(data);
  });
  return out;
}

// Precomputed collections
const PAGES_BY_URI = indexByUri(pageMods);

// ---- Pages
export function getFlexiblePageByUri(uri) {
  return PAGES_BY_URI.get(normalizeUri(uri)) || null;
}

export function getAllFlexiblePagePaths() {
  return Array.from(PAGES_BY_URI.values())
    .map((p) => slugParamFromUri(p.uri))
    .filter((s) => s.length > 0) // don’t emit root here (index handles "/")
    .map((s) => ({ params: { slug: s } })); // <-- string param for [...slug] / [[...slug]]
}
