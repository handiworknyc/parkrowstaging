type FlexiblePageLike = Record<string, any> | null | undefined;

function normalizeHtml(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
