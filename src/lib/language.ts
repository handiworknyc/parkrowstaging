/**
 * Language utilities for English/Chinese content
 */

export type Language = 'en' | 'zh';

export function getCurrentLanguageFromPath(pathname: string): 'en' | 'zh' {
  return pathname === '/zh' || pathname.startsWith('/zh/')
    ? 'zh'
    : 'en';
}
/**
 * Get localized field value
 * Returns Chinese field if language is 'zh' and field exists, otherwise returns English
 */
export function getLocalizedField<T = string>(
  data: any,
  fieldName: string,
  lang: Language
): T {
  if (lang === 'zh') {
    const chineseField = `${fieldName}_chinese`;
    const chineseValue = data?.[chineseField];
    if (chineseValue !== undefined && chineseValue !== null && chineseValue !== '') {
      return chineseValue as T;
    }
  }
  
  return (data?.[fieldName] ?? '') as T;
}

/**
 * Build URL with language parameter
 */
export function getLangUrl(url: URL, lang: Language): string {
  const newUrl = new URL(url);
  newUrl.searchParams.set('lang', lang);
  return newUrl.pathname + newUrl.search;
}