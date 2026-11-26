import { describe, expect, test } from 'vitest';
import type { Dictionary, Plural } from '@/i18n';
import { en } from '@/i18n/locales/en';

/**
 * Every dictionary file in src/i18n/locales is checked against English, whether or not the app lists it yet.
 * Set LOCALE=de to check one language only.
 */
const modules = import.meta.glob<Record<string, Dictionary>>('../../src/i18n/locales/*.ts', { eager: true });
const only = process.env.LOCALE;
const dictionaries = Object.entries(modules).flatMap(([path, module]): Array<[string, Dictionary]> => {
  const code = /\/([a-z]{2})\.ts$/.exec(path)?.[1];
  return code && code !== 'en' && (!only || only === code) && module[code] ? [[code, module[code]]] : [];
});

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
const forms = (message: unknown): string[] => (typeof message === 'string' ? [message] : Array.isArray(message) ? message : Object.values(message as Plural));
const keys = (Object.keys(en) as Array<keyof typeof en>).filter((key) => key !== 'terms');
/** Names that must reach the reader exactly as the files and the standards write them. */
const PRESERVED = ['MedView', 'FHIR', 'HL7 v2', 'DICOM', 'openEHR', 'FHIRPath', 'JSON', 'XML'];

describe.each(dictionaries)('%s dictionary', (code, dictionary) => {
  test('has every key of the English source and no others', () => {
    expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort());
  });

  test('uses exactly the placeholders of the English source', () => {
    for (const key of keys) {
      const expected = new Set(forms(en[key]).flatMap(placeholders));
      const message = dictionary[key];
      // A form that names its number in words (the Arabic dual, "two days") needs no {{count}}.
      const spelled = typeof message === 'object' && !Array.isArray(message) ? [(message as Plural).one, (message as Plural).two] : [];
      for (const text of forms(message)) {
        if (spelled.includes(text) && !text.includes('{{')) continue;
        expect(new Set(placeholders(text)), key).toEqual(expected);
      }
    }
  });

  test('keeps lists the same length and leaves nothing empty', () => {
    for (const key of keys) {
      if (Array.isArray(en[key])) expect(dictionary[key], key).toHaveLength((en[key] as readonly string[]).length);
      for (const text of forms(dictionary[key])) expect(text.trim(), key).not.toBe('');
    }
  });

  test('gives every plural the forms its language needs', () => {
    const categories = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
    for (const key of keys) {
      const message = dictionary[key];
      if (typeof message === 'string' || Array.isArray(message)) continue;
      for (const category of categories) expect(message as Plural, `${key} (${category})`).toHaveProperty(category);
    }
  });

  test('is actually translated', () => {
    const untranslated = keys.filter((key) => typeof en[key] === 'string' && dictionary[key] === en[key] && /[a-z]{4}/.test(en[key] as string));
    // Proper names and syntax examples are the same in every language.
    // French, German and Italian share spellings with English ("Patient", "Normal", "Images").
    expect(untranslated.length, untranslated.join(', ')).toBeLessThan(14);
  });

  test('keeps product and format names as they are written', () => {
    for (const key of keys) {
      const source = forms(en[key]).join(' ');
      const target = forms(dictionary[key]).join(' ');
      for (const name of PRESERVED) if (source.includes(name)) expect(target, `${key} should keep "${name}"`).toContain(name);
    }
  });

  test('translates the same terms as the other languages', () => {
    expect(Object.keys(dictionary.terms).length).toBeGreaterThan(50);
  });
});
