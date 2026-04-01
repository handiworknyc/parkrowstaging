import type { NormRow } from "./normalize";
import { getHeroFullBleedRow } from "./hero";
import {
  buildResponsiveSrcSet,
  extractWpResponsiveImages,
  getResponsivePrimarySrc,
  normalizeResponsiveBreakpoint,
} from "../images/responsive";

function isFullWidthFullBleedRow(row: NormRow | null | undefined): boolean {
  if (!row || row.name !== "full_bleed_img") return false;

  return typeof row.data?.width === "string"
    ? row.data.width.trim().toLowerCase() === "full"
    : false;
}

/**
 * Responsive sizes optimized for hero video posters
 */
function getResponsiveSizes(): string {
  return [
    "(max-width: 640px) 100vw",
    "(max-width: 1024px) 90vw",
    "(max-width: 1440px) 80vw",
    "1400px",
  ].join(", ");
}

function inferImageMimeType(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  const normalized = String(url).split("?")[0].toLowerCase();
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".png")) return "image/png";
  return undefined;
}

function buildLcpPreloadItem({
  images,
  panorama = false,
  imagesizes,
  media,
}: {
  images: ReturnType<typeof extractWpResponsiveImages>;
  panorama?: boolean;
  imagesizes: string;
  media?: string;
}) {
  if (!images) return null;

  const href = getResponsivePrimarySrc(images, { panorama });
  if (!href) return null;

  return {
    href,
    imagesrcset: buildResponsiveSrcSet(images, { panorama }),
    imagesizes,
    type: inferImageMimeType(href),
    media,
  };
}

/**
 * Get LCP image data for hero video poster
 */
export function getLcpImage(rows: NormRow[]) {
  if (!rows || !rows.length) return null;

  const targetRow = getHeroFullBleedRow(rows) || rows[0];
  const targetData = targetRow?.data || {};
  const videoData = Array.isArray(targetData.video) ? targetData.video[0] : null;

  if (!videoData?.yt_img && !videoData?.yt_img_mob) return null;

  const panorama = targetData?.panorama === true;
  const imagesizes = isFullWidthFullBleedRow(targetRow)
    ? "100vw"
    : getResponsiveSizes();
  const desktopImages =
    extractWpResponsiveImages(videoData.yt_img) ||
    extractWpResponsiveImages(videoData.yt_img_mob || null);
  const mobileImages = isFullWidthFullBleedRow(targetRow)
    ? extractWpResponsiveImages(videoData.yt_img_mob || null)
    : null;
  const mobileBreakpoint = isFullWidthFullBleedRow(targetRow)
    ? normalizeResponsiveBreakpoint(videoData.mob_img_breakpoint)
    : null;

  if (mobileImages && mobileBreakpoint) {
    const mobilePreload = buildLcpPreloadItem({
      images: mobileImages,
      panorama,
      imagesizes,
      media: `(max-width: ${mobileBreakpoint}px)`,
    });
    const desktopPreload = buildLcpPreloadItem({
      images: desktopImages,
      panorama,
      imagesizes,
      media: `(min-width: ${mobileBreakpoint + 1}px)`,
    });
    const preloads = [mobilePreload, desktopPreload].filter(Boolean);

    if (preloads.length === 1) {
      return preloads[0];
    }

    if (preloads.length > 1) {
      return preloads;
    }
  }

  return buildLcpPreloadItem({
    images: desktopImages,
    panorama,
    imagesizes,
  });
}

/**
 * Get LCP video data for hero video
 * Returns object matching your MainLayout lcpVideo prop
 */
export function getLcpVideo(rows: NormRow[]) {
  if (!rows || !rows.length) return null;

  const firstRow = rows[0];
  const targetRow =
    firstRow?.name === "splash_video"
      ? firstRow
      : getHeroFullBleedRow(rows) || firstRow;
  const targetData = targetRow?.data || {};
  if (!targetData.video || !targetData.video[0]) return null;

  const v = targetData.video[0];
  const mobileHref =
    isFullWidthFullBleedRow(targetRow) && typeof v.cf_stream_mob === "string"
      ? v.cf_stream_mob.trim() || null
      : null;
  const mobileBreakpoint =
    mobileHref && isFullWidthFullBleedRow(targetRow)
      ? normalizeResponsiveBreakpoint(v.mob_img_breakpoint)
      : null;
  const desktopHref =
    typeof v.cf_stream_video === "string" ? v.cf_stream_video.trim() : "";

  if (desktopHref || mobileHref) {
    return {
      href: desktopHref || null,
      mobileHref,
      mobileBreakpoint,
    };
  }

  return null;
}
