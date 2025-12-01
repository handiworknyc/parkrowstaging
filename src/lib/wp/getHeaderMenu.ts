// src/lib/wp/getHeaderMenu.ts
import { navQuery } from "@/lib/api";
import { getEnv, toBase64 } from "@/lib/env";

/* -----------------------------------------------------
   🔥 Persistent in-memory cache (server lifetime)
   This is what removes the navigation delay
----------------------------------------------------- */
let _cachedMenu: string | null = null;
let _cachePromise: Promise<string> | null = null;

/* -----------------------------------------------------
   Auth helper
----------------------------------------------------- */
function basicAuthHeader(): Record<string, string> {
  const pair = getEnv("WP_AUTH_BASIC"); // "user:pass"
  if (!pair) return {};
  const token = toBase64(pair);
  return token ? { Authorization: `Basic ${token}` } : {};
}

/* -----------------------------------------------------
   Determine if returned content is empty/bad
----------------------------------------------------- */
function looksEmptyMenu(s: string | null | undefined): boolean {
  const t = String(s ?? "").trim();
  if (!t) return true;
  return !/<li\b|<ul\b|<a\b/i.test(t);
}

/* -----------------------------------------------------
   MAIN FUNCTION
----------------------------------------------------- */
export async function getHeaderMenu(): Promise<string> {
  // 🔥 1) Already cached → return instantly (0 ms)
  if (_cachedMenu !== null) return _cachedMenu;

  // 🔥 2) Another request is loading it → wait on promise
  if (_cachePromise) return _cachePromise;

  // 🔥 3) Load fresh (cold start) and store promise so only one loads
  _cachePromise = (async () => {
    const menu = await loadMenuOnce();
    _cachedMenu = menu;
    _cachePromise = null;
    return menu;
  })();

  return _cachePromise;
}

/* -----------------------------------------------------
   INTERNAL LOADER (runs ONCE per server lifecycle)
----------------------------------------------------- */
async function loadMenuOnce(): Promise<string> {
  const gql = getEnv("WORDPRESS_API_URL");
  const baseFromGql = gql ? gql.replace(/\/graphql\/?$/i, "") : "";
  const fallbackBase = getEnv("WP_BASE_URL");
  const base = baseFromGql || fallbackBase;

  if (!base) {
    console.warn("[getHeaderMenu] Missing WP_BASE_URL / WORDPRESS_API_URL");
    return await fallbackGraphQL();
  }

  const endpoint = new URL("/wp-json/astro/v1/headermenu", base).toString();

  try {
    const res = await fetch(endpoint, {
      headers: {
        Accept: "text/html,application/json;q=0.9",
        ...basicAuthHeader(),
      },
      cache: "no-store",
    });

    const text = await res.text();

    if (!res.ok) {
      console.warn("[getHeaderMenu] HTTP", res.status, text.slice(0, 200));
      return await fallbackGraphQL();
    }

    // Always treat REST response as raw HTML
    if (!looksEmptyMenu(text)) return text;

    // Otherwise fallback
    return await fallbackGraphQL();
  } catch (err: any) {
    console.error("[getHeaderMenu] REST error:", err?.message || err);
    return await fallbackGraphQL();
  }
}

/* -----------------------------------------------------
   GraphQL fallback builder
----------------------------------------------------- */
async function fallbackGraphQL(): Promise<string> {
  try {
    const nav = await navQuery();
    const items = nav?.menus?.nodes?.[0]?.menuItems?.nodes ?? [];

    if (!Array.isArray(items) || items.length === 0) return "";

    return items
      .map((it: any) => {
        const href = it?.uri || it?.url || "#";
        const label = it?.label || it?.title || "Menu";
        return `<li class="menu-item"><a href="${href}">${label}</a></li>`;
      })
      .join("");
  } catch (e: any) {
    console.error("[getHeaderMenu] GraphQL fallback failed:", e?.message);
    return "";
  }
}
