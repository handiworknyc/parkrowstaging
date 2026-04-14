import type { AstroCookies } from "astro";

export const PREVIEW_CACHE_CONTROL =
  "private, no-store, max-age=0, must-revalidate";

const PREVIEW_COOKIE = "hw_preview";

export type PreviewAccessState = {
  previewRequested: boolean;
  secretMatched: boolean;
  hasPreviewSession: boolean;
  shouldUsePreview: boolean;
};

function getPreviewSecret(): string {
  return (process.env.PREVIEW_SECRET || "").trim();
}

function getPreviewParam(url: URL): string {
  return (url.searchParams.get("preview") || "").trim();
}

export function resolvePreviewAccess(
  url: URL,
  cookies: AstroCookies,
  cookiePath = "/"
): PreviewAccessState {
  const previewSecret = getPreviewSecret();
  const previewParam = getPreviewParam(url);
  const previewCookie = (cookies.get(PREVIEW_COOKIE)?.value || "").trim();
  const secretMatched = Boolean(previewSecret) && previewParam === previewSecret;

  if (secretMatched && previewCookie !== previewSecret) {
    cookies.set(PREVIEW_COOKIE, previewSecret, {
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      path: cookiePath,
      maxAge: 60 * 60 * 12,
    });
  }

  const hasPreviewSession =
    !previewSecret || secretMatched || previewCookie === previewSecret;
  const previewRequested = previewParam.toLowerCase() === "true";
  const shouldUsePreview =
    secretMatched || (previewRequested && hasPreviewSession);

  return {
    previewRequested,
    secretMatched,
    hasPreviewSession,
    shouldUsePreview,
  };
}
