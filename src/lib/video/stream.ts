export const VIDEO_STREAM_CONFIG = {
  mobileViewportBreakpoint: 1024,
  desktopClientBandwidthHint: 25000,
  mobileClientBandwidthHint: null as number | null,
} as const;

export type ClientBandwidthHint = number | null;
export type CriticalVideoPreloadVariant = {
  href: string;
  media?: string;
};
export type ResponsiveCriticalVideoConfig = {
  href?: string | null;
  mobileHref?: string | null;
  mobileBreakpoint?: number | null;
};

export function isMobileVideoViewport(viewportWidth: number): boolean {
  return viewportWidth < VIDEO_STREAM_CONFIG.mobileViewportBreakpoint;
}

export function getClientBandwidthHintForViewport(
  viewportWidth: number
): ClientBandwidthHint {
  return isMobileVideoViewport(viewportWidth)
    ? VIDEO_STREAM_CONFIG.mobileClientBandwidthHint
    : VIDEO_STREAM_CONFIG.desktopClientBandwidthHint;
}

export function buildStreamUrl(
  baseUrl: string,
  clientBandwidthHint: ClientBandwidthHint
): string {
  if (!baseUrl) return "";

  try {
    const url = new URL(baseUrl);

    if (clientBandwidthHint == null) {
      url.searchParams.delete("clientBandwidthHint");
    } else {
      url.searchParams.set(
        "clientBandwidthHint",
        String(clientBandwidthHint)
      );
    }

    return url.toString();
  } catch {
    const [pathname, rawQuery = ""] = baseUrl.split("?");
    const params = new URLSearchParams(rawQuery);

    if (clientBandwidthHint == null) {
      params.delete("clientBandwidthHint");
    } else {
      params.set("clientBandwidthHint", String(clientBandwidthHint));
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }
}

export function getCriticalVideoPreloadVariants(baseUrl: string) {
  const mobileHref = buildStreamUrl(
    baseUrl,
    VIDEO_STREAM_CONFIG.mobileClientBandwidthHint
  );
  const desktopHref = buildStreamUrl(
    baseUrl,
    VIDEO_STREAM_CONFIG.desktopClientBandwidthHint
  );

  if (!mobileHref) return [];

  if (mobileHref === desktopHref) {
    return [{ href: mobileHref }];
  }

  const desktopMinWidth = VIDEO_STREAM_CONFIG.mobileViewportBreakpoint;
  const mobileMaxWidth = desktopMinWidth - 1;

  return [
    {
      href: mobileHref,
      media: `(max-width: ${mobileMaxWidth}px)`,
    },
    {
      href: desktopHref,
      media: `(min-width: ${desktopMinWidth}px)`,
    },
  ];
}

export function getCriticalVideoPreloadUrls(baseUrl: string): string[] {
  return Array.from(
    new Set(getCriticalVideoPreloadVariants(baseUrl).map((variant) => variant.href))
  );
}

export function getResponsiveCriticalVideoPreloadVariants(
  config: ResponsiveCriticalVideoConfig | null
): CriticalVideoPreloadVariant[] {
  if (!config?.href && !config?.mobileHref) return [];

  const { href, mobileHref, mobileBreakpoint } = config;

  if ((!mobileHref || !mobileBreakpoint) && href) {
    return getCriticalVideoPreloadVariants(href);
  }

  if (!href && mobileHref && mobileBreakpoint) {
    return [
      {
        href: buildStreamUrl(
          mobileHref,
          VIDEO_STREAM_CONFIG.mobileClientBandwidthHint
        ),
        media: `(max-width: ${mobileBreakpoint}px)`,
      },
    ];
  }

  if (!href) return [];

  const variants: CriticalVideoPreloadVariant[] = [];
  const pushVariant = (variant: CriticalVideoPreloadVariant | null) => {
    if (!variant?.href) return;
    if (
      variants.some(
        (existing) =>
          existing.href === variant.href && existing.media === variant.media
      )
    ) {
      return;
    }

    variants.push(variant);
  };

  pushVariant({
    href: buildStreamUrl(
      mobileHref,
      VIDEO_STREAM_CONFIG.mobileClientBandwidthHint
    ),
    media: `(max-width: ${mobileBreakpoint}px)`,
  });

  const desktopMobileBandwidthMax =
    VIDEO_STREAM_CONFIG.mobileViewportBreakpoint - 1;
  const desktopMobileBandwidthMin = mobileBreakpoint + 1;

  if (desktopMobileBandwidthMin <= desktopMobileBandwidthMax) {
    pushVariant({
      href: buildStreamUrl(
        href,
        VIDEO_STREAM_CONFIG.mobileClientBandwidthHint
      ),
      media: `(min-width: ${desktopMobileBandwidthMin}px) and (max-width: ${desktopMobileBandwidthMax}px)`,
    });
  }

  pushVariant({
    href: buildStreamUrl(
      href,
      VIDEO_STREAM_CONFIG.desktopClientBandwidthHint
    ),
    media: `(min-width: ${Math.max(
      mobileBreakpoint + 1,
      VIDEO_STREAM_CONFIG.mobileViewportBreakpoint
    )}px)`,
  });

  return variants;
}

export function getResponsiveCriticalVideoPreloadUrls(
  config: ResponsiveCriticalVideoConfig | null
): string[] {
  return Array.from(
    new Set(
      getResponsiveCriticalVideoPreloadVariants(config).map(
        (variant) => variant.href
      )
    )
  );
}
