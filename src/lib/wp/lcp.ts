import type { NormRow } from "./normalize";
import { getHeroFullBleedRow } from "./hero";
import {
  buildResponsiveSrcSet,
  extractWpResponsiveImages,
  getResponsivePrimarySrc,
  normalizeResponsiveBreakpoint,
} from "../images/responsive";

const CAROUSEL_MOBILE_BREAKPOINT = 599;
const CAROUSEL_DESKTOP_BREAKPOINT = CAROUSEL_MOBILE_BREAKPOINT + 1;
const CRITICAL_CAROUSEL_IMAGE_COUNT = 3;

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

function getCarouselImageData(item: any) {
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

function getCriticalCarouselPreloads(rows: NormRow[]) {
  const firstRow = rows[0];
  const secondRow = rows[1];

  if (firstRow?.name !== "page_title" || secondRow?.name !== "carousel") {
    return [];
  }

  const carouselItems = Array.isArray(secondRow.data?.images)
    ? secondRow.data.images.slice(0, CRITICAL_CAROUSEL_IMAGE_COUNT)
    : [];

  const preloads = carouselItems.flatMap((item) => {
    const imgData = getCarouselImageData(item);
    if (!imgData) return [];

    const mediumHref =
      typeof imgData.sizes?.intch_med === "string" ? imgData.sizes.intch_med : "";
    const largeHref =
      typeof imgData.sizes?.intch_lg === "string" ? imgData.sizes.intch_lg : "";
    const fallbackHref =
      typeof imgData.url === "string"
        ? imgData.url
        : typeof imgData.src === "string"
          ? imgData.src
          : "";

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
    if (!href) return [];

    return [
      {
        href,
        type: inferImageMimeType(href),
      },
    ];
  });

  return preloads.filter((item, index, items) => {
    const key = [item.href, item.media || ""].join("|");
    return items.findIndex((candidate) => {
      const candidateKey = [candidate.href, candidate.media || ""].join("|");
      return candidateKey === key;
    }) === index;
  });
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

  const criticalCarouselPreloads = getCriticalCarouselPreloads(rows);
  if (criticalCarouselPreloads.length > 0) {
    return criticalCarouselPreloads;
  }

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

export function hasSplashVideo(rows: NormRow[]) {
  return Array.isArray(rows) && rows[0]?.name === "splash_video";
}
