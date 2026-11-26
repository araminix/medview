/** The interface languages, each named in itself. Persian is written right to left. */
export const LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr', locale: 'en-GB' },
  { code: 'fa', name: 'فارسی', dir: 'rtl', locale: 'fa-IR' },
  { code: 'tr', name: 'Türkçe', dir: 'ltr', locale: 'tr-TR' },
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
