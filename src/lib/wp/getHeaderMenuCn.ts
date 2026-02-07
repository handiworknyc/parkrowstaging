import { getEnv, toBase64 } from "@/lib/env";

let _cachedCN: Record<number, string> | null = null;
let _cachePromise: Promise<Record<number, string>> | null = null;

function basicAuthHeader(): Record<string, string> {
  const pair = getEnv("WP_AUTH_BASIC");
  if (!pair) return {};
  const token = toBase64(pair);
  return token ? { Authorization: `Basic ${token}` } : {};
}

export async function getHeaderMenuCN(): Promise<Record<number, string>> {
  if (_cachedCN) return _cachedCN;
  if (_cachePromise) return _cachePromise;

  _cachePromise = (async () => {
    const map = await loadOnce();
    _cachedCN = map;
    _cachePromise = null;
    return map;
  })();

  return _cachePromise;
}

async function loadOnce(): Promise<Record<number, string>> {
  const base = getEnv("WP_BASE_URL");
  if (!base) return {};

  const endpoint = new URL(
    "/wp-json/astro/v1/headermenu-cn",
    base
  ).toString();

  try {
    const res = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        ...basicAuthHeader(),
      },
      cache: "no-store",
    });

    if (!res.ok) return {};
    const json = await res.json();

    // normalize → { number: string }
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(json || {})) {
      if (typeof v === "string") {
        const id = Number(k);
        if (!Number.isNaN(id)) out[id] = v;
      }
    }

    return out;
  } catch {
    return {};
  }
}
