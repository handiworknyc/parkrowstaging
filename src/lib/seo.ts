export type SiteLanguage = "en" | "zh";

export const SITE_URL = "https://parkrowbellevue.com";
export const SITE_NAME = "Park Row Bellevue";

export const OG_LOCALES: Record<SiteLanguage, string> = {
  en: "en_US",
  zh: "zh_CN",
};

export function normalizeSitePath(pathname = "/"): string {
  let normalized = pathname.trim() || "/";

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  normalized = normalized.replace(/\/{2,}/g, "/");

  if (!normalized.endsWith("/")) {
    normalized = `${normalized}/`;
  }

  return normalized;
}

export function toEnglishPathname(pathname = "/"): string {
  const withoutLanguagePrefix =
    normalizeSitePath(pathname).replace(/^\/zh(?=\/|$)/, "") || "/";

  return normalizeSitePath(withoutLanguagePrefix);
}

export function toChinesePathname(pathname = "/"): string {
  const englishPath = toEnglishPathname(pathname);

  return englishPath === "/" ? "/zh/" : `/zh${englishPath}`;
}

export function toSiteUrl(pathname = "/"): string {
  return new URL(normalizeSitePath(pathname), SITE_URL).toString();
}
