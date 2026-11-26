import { directionOf, localeOf, type Direction, type LanguageCode } from './languages';
import { ar } from './locales/ar';
import { de } from './locales/de';
import { en } from './locales/en';
import { es } from './locales/es';
import { fa } from './locales/fa';
import { fr } from './locales/fr';
import { hi } from './locales/hi';
import { it } from './locales/it';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { pt } from './locales/pt';
import { ru } from './locales/ru';
import { tr } from './locales/tr';
import { zh } from './locales/zh';

export { LANGUAGES, detectLanguage, directionOf, isLanguage, type LanguageCode } from './languages';

/** A message, or one per plural form of the language for a `count` parameter (Russian has four forms, Arabic six). */
export type Plural = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
type Source = typeof en;
export type ListKey = { [K in keyof Source]: Source[K] extends readonly string[] ? K : never }[keyof Source];
export type MessageKey = Exclude<keyof Source, ListKey | 'terms'>;
/** Every language must provide exactly the keys English has, with lists staying lists. */
export type Dictionary = { [K in keyof Source]: K extends 'terms' ? Record<string, string> : Source[K] extends readonly string[] ? readonly string[] : string | Plural };
type Params = Record<string, string | number>;

/**
 * Every dictionary is bundled: loading one on demand would be a network
 * request after page load, which MedView promises never to make.
 */
const DICTIONARIES: Record<LanguageCode, Dictionary> = { ar, de, en, es, fa, fr, hi, it, ja, ko, pt, ru, tr, zh };

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

/** Persian uses the Jalali (Solar Hijri) calendar with Persian digits; the others, Arabic included, Gregorian with Western digits. */
export function activeLocale(): string {
  return active === 'fa' ? 'fa-IR-u-ca-persian-nu-arabext' : `${localeOf(active)}-u-ca-gregory-nu-latn`;
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const DECIMAL_SEPARATOR = '٫';
/** Runs of text between spaces and brackets; a run containing Latin letters is a code or unit. */
const TOKEN = /[^\s()[\]،؛:«»—–·]+/g;

/**
 * Writes numbers with Persian digits (and the Persian decimal mark) when the interface is
 * Persian. Anything attached to Latin letters — "HL7", "v2", "1.73m2", "HbA1c", an MRN —
 * is a code, a unit or an identifier and is left exactly as written.
 */
export function digits(value: string | number | undefined): string {
  const text = value === undefined ? '' : String(value);
  if (active !== 'fa') return text;
  return text.replace(TOKEN, (token) =>
    /[A-Za-z]/.test(token) ? token : token.replace(/(\d)\.(?=\d)/g, `$1${DECIMAL_SEPARATOR}`).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]),
  );
}

/** Numbers handed in as parameters follow the language's digits; text parameters come from the file and stay as they are. */
function fill(text: string, params?: Params): string {
  const template = digits(text);
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    if (!(name in params)) return match;
    const value = params[name];
    return typeof value === 'number' || /^[\d.,]+$/.test(value) ? digits(value) : value;
  });
}

/** The message in the active language (else English), in the plural form for `params.count`, with {{placeholders}} filled. */
export function t(key: MessageKey, params?: Params): string {
  const message = (DICTIONARIES[active][key] ?? en[key]) as string | Plural;
  if (typeof message === 'string') return fill(message, params);
  const form = typeof params?.count === 'number' ? pluralRules.select(params.count) : 'other';
  return fill(message[form] ?? message.other, params);
}

export function tList(key: ListKey): readonly string[] {
  return (DICTIONARIES[active][key] as readonly string[]).map((line) => digits(line));
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
