import { afterEach, describe, expect, test } from 'vitest';
import { dictionaryOf, digits, ltr, setActiveLanguage, t, term, tList, type Plural } from '@/i18n';
import { translateError } from '@/i18n/errors';
import { describeAge, formatDate } from '@/i18n/format';
import { detectLanguage, directionOf } from '@/i18n/languages';
import { en } from '@/i18n/locales/en';
import { buildPlainSummary } from '@/domain/guidance/summarize';
import { recordOf, sample } from './helpers';

afterEach(() => setActiveLanguage('en'));

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
const forms = (message: unknown): string[] => (typeof message === 'string' ? [message] : Array.isArray(message) ? message : Object.values(message as Plural));

describe.each(['fa', 'tr'] as const)('%s dictionary', (lang) => {
  const dictionary = dictionaryOf(lang);
  const keys = (Object.keys(en) as Array<keyof typeof en>).filter((key) => key !== 'terms');

  test('uses exactly the placeholders of the English source', () => {
    for (const key of keys) {
      const expected = new Set(forms(en[key]).flatMap(placeholders));
      for (const text of forms(dictionary[key])) expect(new Set(placeholders(text)), key).toEqual(expected);
    }
  });

  test('keeps lists the same length', () => {
    for (const key of keys) {
      if (Array.isArray(en[key])) expect(dictionary[key], key).toHaveLength((en[key] as readonly string[]).length);
    }
  });

  test('is actually translated', () => {
    const untranslated = keys.filter((key) => typeof en[key] === 'string' && dictionary[key] === en[key] && /[a-z]{4}/.test(en[key] as string));
    // Proper names and syntax examples are the same in every language.
    expect(untranslated).toEqual(expect.arrayContaining([]));
    expect(untranslated.length).toBeLessThan(8);
  });
});

describe('translation', () => {
  test('falls back to plural forms and fills placeholders', () => {
    expect(t('top.warnings', { count: 1 })).toBe('1 warning');
    expect(t('top.warnings', { count: 4 })).toBe('4 warnings');
    setActiveLanguage('tr');
    expect(t('top.warnings', { count: 4 })).toBe('4 uyarı');
    setActiveLanguage('fa');
    expect(t('tab.summary')).toBe('خلاصه من');
    expect(tList('privacy.verifySteps')).toHaveLength(3);
  });

  test('ltr() leaves left-to-right languages untouched', () => {
    expect(ltr('3.5 – 5.1')).toBe('3.5 – 5.1');
    setActiveLanguage('tr');
    expect(ltr('5.9 mmol/L')).toBe('5.9 mmol/L');
  });

  test('terms from parsers are translated, file content is left alone', () => {
    setActiveLanguage('tr');
    expect(term('Outpatient visit')).toBe('Ayaktan muayene');
    expect(term('Lipid Panel')).toBe('Lipid Paneli');
    expect(term('Metformin 500 mg oral tablet')).toBe('Metformin 500 mg oral tablet');
    expect(term(undefined)).toBe('');
  });

  test('English and Turkish dates are Gregorian with Western digits', () => {
    expect(formatDate('2025-03-14T09:30', true)).toBe('14 Mar 2025, 09:30');
    expect(formatDate('2025-03')).toBe('Mar 2025');
    expect(formatDate('1968')).toBe('1968');
    setActiveLanguage('tr');
    expect(formatDate('2025-08-14')).toBe('14 Ağu 2025');
  });

  test('Persian dates use the Jalali calendar and Persian digits', () => {
    setActiveLanguage('fa');
    expect(formatDate('2025-03-14')).toBe('۲۴ اسفند ۱۴۰۳');
    expect(formatDate('2025-03-21')).toBe('۱ فروردین ۱۴۰۴');
    expect(formatDate('2025-03-14T09:30', true)).toBe('۲۴ اسفند ۱۴۰۳، ۰۹:۳۰');
    // A bare year maps to the Jalali year it mostly overlaps.
    expect(formatDate('1968')).toBe('۱۳۴۷');
    expect(formatDate('2025-08')).toMatch(/مرداد ۱۴۰۴|۱۴۰۴ مرداد/);
  });

  test('Persian digits apply to numbers but never to codes, units or identifiers', () => {
    expect(digits('8.4')).toBe('8.4');
    setActiveLanguage('fa');
    expect(digits('8.4')).toBe('۸٫۴');
    expect(digits('148/94')).toBe('۱۴۸/۹۴');
    expect(digits('3.5 – 5.1')).toBe('۳٫۵ – ۵٫۱');
    expect(digits(12)).toBe('۱۲');
    expect(digits('74 mL/min/1.73m2')).toBe('۷۴ mL/min/1.73m2');
    expect(digits('HL7 v2 · FHIR R4 · HbA1c')).toBe('HL7 v2 · FHIR R4 · HbA1c');
    expect(digits('MRN-48213907')).toBe('MRN-48213907');
    expect(t('side.age', { age: 58 })).toBe('۵۸ ساله');
    expect(t('med.by', { name: 'Dr. Okafor 2' })).toBe('تجویز: Dr. Okafor 2');
    expect(t('drop.pasteLabel')).toContain('HL7 v2');
    expect(tList('privacy.verifySteps')[0]).toContain('F12');
  });

  test('ages are spoken in the active language', () => {
    const now = new Date(2025, 5, 10);
    expect(describeAge('2025-06-07', now)).toBe('3 days ago');
    setActiveLanguage('tr');
    expect(describeAge('2025-01-10', now)).toBe('5 ay önce');
    setActiveLanguage('fa');
    expect(describeAge('2022-06-01', now)).toBe('بیش از ۳ سال پیش');
  });

  test('engine errors are translated, unknown details pass through', () => {
    setActiveLanguage('tr');
    expect(translateError('This JSON file is damaged or incomplete')).toBe('Bu JSON dosyası bozuk veya eksik');
    expect(translateError('Problem near line 12.')).toBe('Sorun 12. satırın yakınında.');
    expect(translateError('This looks like a Windows program, not a medical record file')).toContain('a Windows program');
    expect(translateError('unclosed xml tag at 4:1')).toBe('unclosed xml tag at 4:1');
  });

  test('the plain summary is produced in the active language', () => {
    const record = recordOf(sample('complex-care.fhir.json'));
    setActiveLanguage('fa');
    const sugar = buildPlainSummary(record).findings.find((f) => f.id === 'blood-sugar')!;
    expect(sugar.title).toBe('قند خون شما بالاست');
    // The value is wrapped in directional isolates so "8.4 %" is not reordered inside Persian text.
    expect(sugar.evidence[1].label.replace(/[\u2066\u2069]/g, '')).toBe('میانگین قند خون سه ماه اخیر (HbA1c): ۸٫۴ %');
    expect(sugar.evidence[1].label).toContain(String.fromCharCode(0x2066) + '۸٫۴ %' + String.fromCharCode(0x2069));
    expect(ltr('3.5 – 5.1')).not.toBe('3.5 – 5.1');
    expect(sugar.selfCare).toHaveLength(5);
    setActiveLanguage('tr');
    expect(buildPlainSummary(record).findings[0].title).toBe('Potasyum düzeyiniz güvenli aralığın dışında');
  });
});

test('language detection and direction', () => {
  expect(detectLanguage(['fa-IR', 'en'])).toBe('fa');
  expect(detectLanguage(['tr-TR'])).toBe('tr');
  expect(detectLanguage(['de-DE', 'ja'])).toBe('en');
  expect(directionOf('fa')).toBe('rtl');
  expect(directionOf('tr')).toBe('ltr');
});
