export const STAGING_SITE_URL = "https://parkrowstaging.netlify.app/";
export const STAGING_BASIC_AUTH = "demo:demo";
export const STAGING_CACHE_CONTROL = "no-store, max-age=0, must-revalidate";
export const STAGING_ROBOTS_TAG = "noindex, nofollow";

const SITE_URL_ENV_KEYS = [
  "SITE_URL",
  "PUBLIC_SITE_URL",
  "URL",
  "DEPLOY_PRIME_URL",
  "DEPLOY_URL",
];

export function normalizeSiteUrl(value) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return `${url.origin}/`;
  } catch {
    return "";
  }
}

export function isStagingSiteUrl(value) {
  return normalizeSiteUrl(value) === STAGING_SITE_URL;
}

export function getSiteUrlCandidates(env = {}) {
  return SITE_URL_ENV_KEYS.map((key) => env[key]).filter(
    (value) => typeof value === "string" && value.trim()
  );
}

export function isStagingSiteEnv(env = {}) {
  return getSiteUrlCandidates(env).some((value) => isStagingSiteUrl(value));
}
