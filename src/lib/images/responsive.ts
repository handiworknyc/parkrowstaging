export interface ImageSource {
  url: string;
  width: number;
}

export type ResponsiveImageInput =
  | string
  | ImageSource
  | undefined
  | false
  | null;

export interface ResponsiveImageMap {
  full?: ResponsiveImageInput;
  xl?: ResponsiveImageInput;
  large?: ResponsiveImageInput;
  med?: ResponsiveImageInput;
  small?: ResponsiveImageInput;
}

export interface WpImageLike {
  url?: string;
  sizes?: Record<string, string | number | undefined>;
}

export const RESPONSIVE_IMAGE_WIDTHS = {
  full: 2400,
  xl: 1700,
  large: 1400,
  med: 1000,
  small: 600,
} as const;

export function extractResponsiveImageUrl(
  img: ResponsiveImageInput
): string | null {
  if (!img) return null;

  if (typeof img === "string") {
    const value = img.trim();
    if (
      !value ||
      value === "false" ||
      value === "undefined" ||
      value === "null"
    ) {
      return null;
    }

    return value;
  }

  return img.url || null;
}

export function extractWpResponsiveImages(
  image?: WpImageLike | false | null
): ResponsiveImageMap | null {
  if (!image) return null;

  const sizes = image.sizes || {};
  const fallbackUrl = image.url || null;

  const images: ResponsiveImageMap = {
    full: typeof sizes.intch_full === "string" ? sizes.intch_full : null,
    xl: typeof sizes.intch_xl === "string" ? sizes.intch_xl : fallbackUrl,
    large: typeof sizes.intch_lg === "string" ? sizes.intch_lg : fallbackUrl,
    med: typeof sizes.intch_med === "string" ? sizes.intch_med : fallbackUrl,
    small: typeof sizes.intch_sm === "string" ? sizes.intch_sm : fallbackUrl,
  };

  return getResponsivePrimarySrc(images) ? images : null;
}

export function buildResponsiveSrcSet(
  images: ResponsiveImageMap,
  options: {
    panorama?: boolean;
  } = {}
): string | undefined {
  const { panorama = false } = options;
  const fullUrl = extractResponsiveImageUrl(images.full);
  const xlUrl = extractResponsiveImageUrl(images.xl);
  const largeUrl = extractResponsiveImageUrl(images.large);
  const medUrl = extractResponsiveImageUrl(images.med);
  const smallUrl = extractResponsiveImageUrl(images.small);

  const candidates = [
    panorama && fullUrl
      ? { url: fullUrl, w: RESPONSIVE_IMAGE_WIDTHS.full }
      : { url: xlUrl, w: RESPONSIVE_IMAGE_WIDTHS.xl },
    { url: largeUrl, w: RESPONSIVE_IMAGE_WIDTHS.large },
    { url: medUrl, w: RESPONSIVE_IMAGE_WIDTHS.med },
    { url: smallUrl, w: RESPONSIVE_IMAGE_WIDTHS.small },
  ].filter((candidate) => candidate.url);

  if (!candidates.length) return undefined;

  return candidates.map((candidate) => `${candidate.url} ${candidate.w}w`).join(", ");
}

export function getResponsivePrimarySrc(
  images: ResponsiveImageMap,
  options: {
    panorama?: boolean;
    forceSize?: "xl" | "large" | "med" | "small";
  } = {}
): string | null {
  const { panorama = false, forceSize } = options;

  if (forceSize) {
    return extractResponsiveImageUrl(images[forceSize]);
  }

  if (panorama) {
    return (
      extractResponsiveImageUrl(images.full) ||
      extractResponsiveImageUrl(images.xl) ||
      extractResponsiveImageUrl(images.large) ||
      extractResponsiveImageUrl(images.med) ||
      extractResponsiveImageUrl(images.small)
    );
  }

  return (
    extractResponsiveImageUrl(images.xl) ||
    extractResponsiveImageUrl(images.large) ||
    extractResponsiveImageUrl(images.med) ||
    extractResponsiveImageUrl(images.small)
  );
}

export function normalizeResponsiveBreakpoint(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}
