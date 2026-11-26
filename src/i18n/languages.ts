/** The interface languages, each named in itself. Arabic and Persian are written right to left. */
export const LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr', locale: 'en-GB' },
  { code: 'zh', name: '中文', dir: 'ltr', locale: 'zh-CN' },
  { code: 'hi', name: 'हिन्दी', dir: 'ltr', locale: 'hi-IN' },
  { code: 'es', name: 'Español', dir: 'ltr', locale: 'es-ES' },
  { code: 'fr', name: 'Français', dir: 'ltr', locale: 'fr-FR' },
  { code: 'ar', name: 'العربية', dir: 'rtl', locale: 'ar' },
  { code: 'fa', name: 'فارسی', dir: 'rtl', locale: 'fa-IR' },
  { code: 'pt', name: 'Português', dir: 'ltr', locale: 'pt-BR' },
  { code: 'ru', name: 'Русский', dir: 'ltr', locale: 'ru-RU' },
  { code: 'ja', name: '日本語', dir: 'ltr', locale: 'ja-JP' },
  { code: 'de', name: 'Deutsch', dir: 'ltr', locale: 'de-DE' },
  { code: 'ko', name: '한국어', dir: 'ltr', locale: 'ko-KR' },
  { code: 'tr', name: 'Türkçe', dir: 'ltr', locale: 'tr-TR' },
  { code: 'it', name: 'Italiano', dir: 'ltr', locale: 'it-IT' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];
export type Direction = 'ltr' | 'rtl';

export function isLanguage(value: unknown): value is LanguageCode {
  return LANGUAGES.some((language) => language.code === value);
}

export function directionOf(code: LanguageCode): Direction {
  return LANGUAGES.find((language) => language.code === code)?.dir ?? 'ltr';
}

export function localeOf(code: LanguageCode): string {
  return LANGUAGES.find((language) => language.code === code)?.locale ?? 'en-GB';
}

/** The first of the browser's languages the app speaks ("tr-TR" is Turkish), else English. */
export function detectLanguage(preferred: readonly string[]): LanguageCode {
  for (const tag of preferred) {
    const code = tag.toLowerCase().split('-')[0];
    if (isLanguage(code)) return code;
  }
  return 'en';
}
