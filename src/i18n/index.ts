import { directionOf, localeOf, type Direction, type LanguageCode } from './languages';
import { en } from './locales/en';
import { fa } from './locales/fa';
import { tr } from './locales/tr';

export { LANGUAGES, detectLanguage, directionOf, isLanguage, type LanguageCode } from './languages';

/** A message, or one per plural form of the language for a `count` parameter. */
export type Plural = { one?: string; other: string };
type Source = typeof en;
export type ListKey = { [K in keyof Source]: Source[K] extends readonly string[] ? K : never }[keyof Source];
export type MessageKey = Exclude<keyof Source, ListKey | 'terms'>;
/** Every language must provide exactly the keys English has, with lists staying lists. */
export type Dictionary = { [K in keyof Source]: K extends 'terms' ? Record<string, string> : Source[K] extends readonly string[] ? readonly string[] : string | Plural };
type Params = Record<string, string | number>;

/**
 * All three dictionaries are bundled: loading one on demand would be a network
 * request after page load, which MedView promises never to make.
 */
const DICTIONARIES: Record<LanguageCode, Dictionary> = { en, fa, tr };

let active: LanguageCode = 'en';
let pluralRules = new Intl.PluralRules('en');

/**
 * Sets the language used by `t`. The app re-mounts its tree when this changes, so
 * components and plain functions alike can call `t` without subscribing to anything.
 */
export function setActiveLanguage(lang: LanguageCode): void {
  active = lang;
  pluralRules = new Intl.PluralRules(lang);
}

export function activeLanguage(): LanguageCode {
  return active;
}

export function activeDirection(): Direction {
  return directionOf(active);
}

/** Gregorian calendar and Western digits in every language, so values always match the source document. */
export function activeLocale(): string {
  return `${localeOf(active)}-u-ca-gregory-nu-latn`;
}

function fill(text: string, params?: Params): string {
  return params ? text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;
}

/** The message in the active language (else English), in the plural form for `params.count`, with {{placeholders}} filled. */
export function t(key: MessageKey, params?: Params): string {
  const message = (DICTIONARIES[active][key] ?? en[key]) as string | Plural;
  if (typeof message === 'string') return fill(message, params);
  const form = typeof params?.count === 'number' ? pluralRules.select(params.count) : 'other';
  return fill((form === 'one' ? message.one : undefined) ?? message.other, params);
}

export function tList(key: ListKey): readonly string[] {
  return DICTIONARIES[active][key] as readonly string[];
}

/**
 * Translates a term that parsers produce in English ("Outpatient visit", "Lipid Panel").
 * Text that has no entry — anything that came from the file itself — is returned unchanged.
 */
export function term(english: string | undefined): string {
  if (!english) return '';
  return DICTIONARIES[active].terms[english] ?? english;
}

const LTR_ISOLATE = String.fromCharCode(0x2066);
const POP_ISOLATE = String.fromCharCode(0x2069);

/**
 * Keeps a value such as "3.5 – 5.1" or "5.9 mmol/L" reading left to right inside
 * right-to-left text, where the bidi algorithm would otherwise swap its parts.
 * In left-to-right languages the text is returned untouched.
 */
export function ltr(text: string | undefined): string {
  if (!text) return '';
  return activeDirection() === 'rtl' ? `${LTR_ISOLATE}${text}${POP_ISOLATE}` : text;
}

export function dictionaryOf(lang: LanguageCode): Dictionary {
  return DICTIONARIES[lang];
}
