type FlexiblePageLike = Record<string, any> | null | undefined;

function normalizeHtml(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

export type FlexiblePageSeoImage = {
  id: number | null;
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
};

export type FlexiblePageSeo = {
  title: string;
  description: string;
  image: FlexiblePageSeoImage | null;
};

export type FlexiblePageMeta = {
  title: string;
  description: string;
  seo: FlexiblePageSeo | null;
};

export function getFlexiblePageTitle(
  page: FlexiblePageLike,
  fallback = ""
): string {
  if (!page || typeof page !== "object") {
    return fallback;
  }

  const directTitle = normalizeHtml(page.title);
  if (directTitle) {
    return directTitle;
  }

  if (page.title && typeof page.title === "object") {
    const renderedTitle = normalizeHtml(page.title.rendered);
    if (renderedTitle) {
      return renderedTitle;
    }
  }

  return fallback;
}

export function getFlexiblePageSeo(page: FlexiblePageLike): FlexiblePageSeo | null {
  if (!page || typeof page !== "object") {
    return null;
  }

  const rawSeo = page.seo;
  if (!rawSeo || typeof rawSeo !== "object") {
    return null;
  }

  const title = normalizeHtml(rawSeo.title);
  const description = normalizeHtml(rawSeo.description);

  let image: FlexiblePageSeoImage | null = null;
  if (rawSeo.image && typeof rawSeo.image === "object") {
    const url = normalizeHtml(rawSeo.image.url);

    if (url) {
      image = {
        id: normalizePositiveInteger(rawSeo.image.id),
        url,
        width: normalizePositiveInteger(rawSeo.image.width),
        height: normalizePositiveInteger(rawSeo.image.height),
        alt: normalizeHtml(rawSeo.image.alt),
      };
    }
  }

  if (!title && !description && !image) {
    return null;
  }

  return {
    title,
    description,
    image,
  };
}

export function getFlexiblePageMeta(
  page: FlexiblePageLike,
  fallbackTitle = ""
): FlexiblePageMeta {
  const seo = getFlexiblePageSeo(page);
  const title = seo?.title || getFlexiblePageTitle(page, fallbackTitle);
  const description = seo?.description || "";

  return {
    title,
    description,
    seo,
  };
}

export function getFlexiblePageContentHtml(page: FlexiblePageLike): string {
  if (!page || typeof page !== "object") {
    return "";
  }

  const directKeys = [
    "contentHtml",
    "content_html",
    "editorHtml",
    "editor_html",
    "renderedContent",
    "rendered_content",
  ];

  for (const key of directKeys) {
    const html = normalizeHtml(page[key]);
    if (html) {
      return html;
    }
  }

  const content = page.content;

  if (typeof content === "string") {
    return normalizeHtml(content);
  }

  if (content && typeof content === "object") {
    const rendered = normalizeHtml(content.rendered);
    if (rendered) {
      return rendered;
    }
  }

  return "";
}
