import hideLanguageData from "@/content/wp/hide-language.json";

type HideLanguageContent = {
  hide_language?: unknown;
};

const content = hideLanguageData as HideLanguageContent;
const hideLanguage = !!content.hide_language;

export async function getHideLanguage(): Promise<boolean> {
  return hideLanguage;
}

export function getHideLanguageSync(): boolean {
  return hideLanguage;
}

export function areTranslatedRoutesEnabled(): boolean {
  return !hideLanguage;
}
