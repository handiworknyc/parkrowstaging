import type { APIRoute } from "astro";
import { getAllFlexiblePagePaths } from "../lib/api.js";
import { areTranslatedRoutesEnabled } from "../lib/wp/getHideLanguage";
import { toChinesePathname, toEnglishPathname, toSiteUrl } from "../lib/seo";

export const prerender = true;

type FlexiblePagePath = {
  params?: {
    slug?: string | string[];
  };
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slugToPath(path: FlexiblePagePath): string {
  const slug = path.params?.slug;
  const segments = Array.isArray(slug) ? slug : slug ? [slug] : [];

  return toEnglishPathname(`/${segments.filter(Boolean).join("/")}/`);
}

function buildAlternateLinks(englishPath: string): string {
  const englishHref = escapeXml(toSiteUrl(englishPath));
  const chineseHref = escapeXml(toSiteUrl(toChinesePathname(englishPath)));

  return [
    `    <xhtml:link rel="alternate" hreflang="en" href="${englishHref}" />`,
    `    <xhtml:link rel="alternate" hreflang="zh" href="${chineseHref}" />`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${englishHref}" />`,
  ].join("\n");
}

function buildUrlEntry(locationPath: string, englishPath: string): string {
  const locationHref = escapeXml(toSiteUrl(locationPath));

  return [
    "  <url>",
    `    <loc>${locationHref}</loc>`,
    buildAlternateLinks(englishPath),
    "  </url>",
  ].join("\n");
}

function buildSimpleUrlEntry(locationPath: string): string {
  const locationHref = escapeXml(toSiteUrl(locationPath));

  return [
    "  <url>",
    `    <loc>${locationHref}</loc>`,
    "  </url>",
  ].join("\n");
}

export const GET: APIRoute = () => {
  const translationsEnabled = areTranslatedRoutesEnabled();
  const englishPaths = Array.from(
    new Set([
      "/",
      ...getAllFlexiblePagePaths().map((path) => slugToPath(path)),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const urlEntries = translationsEnabled
    ? englishPaths.flatMap((englishPath) => [
        buildUrlEntry(englishPath, englishPath),
        buildUrlEntry(toChinesePathname(englishPath), englishPath),
      ])
    : englishPaths.map((englishPath) => buildSimpleUrlEntry(englishPath));

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urlEntries,
    "</urlset>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
