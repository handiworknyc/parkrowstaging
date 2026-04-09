// src/lib/env.ts
const BUILD_SAFE_ENV_KEYS = new Set([
  "BASE_URL",
  "LOG_GF",
  "PUBLIC_CN_MENU_DEBUG",
  "PUBLIC_EDGEWISE_DEBUG",
  "PUBLIC_FALLBACK_EMAIL",
  "PUBLIC_FALLBACK_PHONE",
  "PUBLIC_HOME_SLUG",
  "PUBLIC_WP_BASE_URL",
  "STRICT_IMAGE_ALLOWLIST",
  "WORDPRESS_API_URL",
  "WP_BASE_URL",
  "WP_GRAPHQL_URL",
  "WP_IMAGE_ALLOW_HOSTS",
]);

let nodeEnvLoaded = false;

function inferNodeEnvMode(): string {
  // @ts-ignore process is Node-only
  const explicitMode = typeof process !== "undefined" ? String(process.env.NODE_ENV || "").trim() : "";
  if (explicitMode) return explicitMode;

  // @ts-ignore process is Node-only
  const argv = typeof process !== "undefined" && Array.isArray(process.argv)
    ? process.argv.map((value) => String(value).toLowerCase())
    : [];

  if (argv.includes("dev")) return "development";
  if (argv.includes("build")) return "production";
  if (argv.includes("preview")) return "production";

  return "";
}

function ensureNodeEnvLoaded() {
  if (nodeEnvLoaded) return;
  nodeEnvLoaded = true;

  // @ts-ignore process is Node-only
  if (typeof process === "undefined" || typeof process.loadEnvFile !== "function") {
    return;
  }

  const mode = inferNodeEnvMode();
  const files = [
    ".env",
    ".env.local",
    mode ? `.env.${mode}` : "",
    mode ? `.env.${mode}.local` : "",
  ].filter(Boolean);

  for (const file of files) {
    try {
      process.loadEnvFile(file);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code || "")
          : "";

      if (code !== "ENOENT") {
        console.warn("[env] failed to load env file", { code, file });
      }
    }
  }
}

export function getServerEnv(name: string): string {
  // Edge (Deno)
  // @ts-ignore Deno ambient in Edge
  const de = (typeof Deno !== "undefined" && Deno?.env?.get) ? Deno.env.get(name) : undefined;
  if (de?.trim()) return de.trim();

  // Node
  ensureNodeEnvLoaded();
  // @ts-ignore process ambient in Node
  const pe = (typeof process !== "undefined" && process?.env?.[name]) ? String(process.env[name]) : undefined;
  return pe?.trim() || "";
}

export function getEnv(name: string): string {
  const runtimeValue = getServerEnv(name);
  if (runtimeValue) return runtimeValue;

  if (!(name.startsWith("PUBLIC_") || BUILD_SAFE_ENV_KEYS.has(name))) {
    return "";
  }

  // Build-time fallback for non-secret config only.
  // @ts-ignore vite/astro injects this
  const me = (typeof import.meta !== "undefined" && import.meta?.env?.[name]) ? String(import.meta.env[name]) : "";
  return me.trim();
}

export function toBase64(s: string): string {
  if (!s) return "";
  try {
    // Edge
    if (typeof btoa === "function") return btoa(s);
    // Node
    // @ts-ignore Buffer is Node only
    if (typeof Buffer !== "undefined") return Buffer.from(s, "utf8").toString("base64");
  } catch { /* ignore */ }
  return "";
}
