import hideLanguageData from "@/content/wp/hide-language.json";

type HideLanguageContent = {
  hide_language?: unknown;
};

const content = hideLanguageData as HideLanguageContent;

export async function getHideLanguage(): Promise<boolean> {
  return !!content.hide_language;
}
