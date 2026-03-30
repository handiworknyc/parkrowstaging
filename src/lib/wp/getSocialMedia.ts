import socialMediaData from "@/content/wp/social-media.json";

type SocialMediaFields = {
  site_phone?: unknown;
};

type SocialMediaContent = {
  social_media?: SocialMediaFields | null;
};

const content = socialMediaData as SocialMediaContent;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function getSocialPhone(): Promise<string> {
  return normalizeText(content.social_media?.site_phone);
}

export function toTelHref(phone: string): string | undefined {
  const digits = String(phone || "").replace(/[^+\d]/g, "");
  return digits ? `tel:${digits}` : undefined;
}
