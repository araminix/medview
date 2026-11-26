import { describe, expect, test } from 'vitest';
import { classifyBodySystem } from '@/domain/bodySystems';
import { calcAge, normalizeDate } from '@/domain/dates';
import { formatDate } from '@/i18n/format';
import { classifyPanel, deriveFlag, parseNumeric, parseRefRange } from '@/domain/labs';
import { describeFrequency } from '@/parsers/fhir/dosage';

describe('dates', () => {
  test('normalizes ISO and compact HL7 timestamps', () => {
    expect(normalizeDate('2025-03-12T08:30:00Z')).toBe('2025-03-12T08:30');
    expect(normalizeDate('20250411070000+0100')).toBe('2025-04-11T07:00');
    expect(normalizeDate('19590223')).toBe('1959-02-23');
    expect(normalizeDate('1982')).toBe('1982');
  });

  test('rejects impossible dates', () => {
    expect(normalizeDate('2025-99-99')).toBeUndefined();
    expect(normalizeDate('2025-02-30')).toBeUndefined();
    expect(normalizeDate('not a date')).toBeUndefined();
  });

  test('computes age and formats partial dates', () => {
    expect(calcAge('1982-04-17', new Date(2025, 3, 16))).toBe(42);
    expect(calcAge('1982-04-17', new Date(2025, 3, 17))).toBe(43);
    expect(calcAge('1982', new Date(2025, 5, 1))).toBe(43);
    expect(formatDate('2025-03-14T09:30', true)).toBe('14 Mar 2025, 09:30');
    expect(formatDate('1982')).toBe('1982');
  });
});

describe('lab helpers', () => {
  test('parses reference ranges', () => {
    expect(parseRefRange('3.5-5.0')).toMatchObject({ low: 3.5, high: 5 });
    expect(parseRefRange('<200')).toMatchObject({ high: 200 });
    expect(parseRefRange('>60')).toMatchObject({ low: 60 });
    expect(parseRefRange('>= 60')).toMatchObject({ low: 60 });
    expect(parseRefRange('negative')).toEqual({ text: 'negative' });
  });

  test('reads numbers behind comparators', () => {
    expect(parseNumeric('<0.01')).toBe(0.01);
    expect(parseNumeric('7,4')).toBe(7.4);
    expect(parseNumeric('Positive')).toBeUndefined();
  });

  test('interpretation codes win over range comparison', () => {
    expect(deriveFlag(5.9, { low: 3.5, high: 5.1 })).toBe('high');
    expect(deriveFlag(3.0, { low: 3.5 })).toBe('low');
    expect(deriveFlag(4, { low: 3.5, high: 5.1 }, 'HH')).toBe('critical');
    expect(deriveFlag(undefined, {}, 'A')).toBe('abnormal');
    expect(deriveFlag(4, {})).toBe('unknown');
  });

  test('groups labs into panels', () => {
    expect(classifyPanel('Hemoglobin A1c')).toBe('Diabetes');
    expect(classifyPanel('Hemoglobin')).toBe('Complete Blood Count');
    expect(classifyPanel('NT-proBNP')).toBe('Cardiac Markers');
    expect(classifyPanel('Mystery marker', 'Send-out panel')).toBe('Send-out panel');
  });
});

describe('body system mapping', () => {
  test.each([
    ['I50.9', 'cardio'], ['J45.909', 'respiratory'], ['K21.9', 'gi'], ['N18.3', 'renal'],
    ['G43.909', 'neuro'], ['E11.9', 'endocrine'], ['D50.9', 'blood'], ['M17.11', 'musculoskeletal'],
  ])('ICD-10 %s → %s', (code, system) => {
    expect(classifyBodySystem('x', [{ code, system: 'ICD-10' }])).toBe(system);
  });

  test('maps LOINC labs and falls back to keywords, then General', () => {
    expect(classifyBodySystem('x', [{ code: '2160-0', system: 'LOINC' }])).toBe('renal');
    expect(classifyBodySystem('Hemoglobin A1c')).toBe('endocrine');
    expect(classifyBodySystem('ALT')).toBe('gi');
    expect(classifyBodySystem('Troponin I')).toBe('cardio');
    expect(classifyBodySystem('Something unmapped', [{ code: 'D12.0', system: 'ICD-10' }])).toBe('general');
  });
});

test('describes dosing frequency in plain English', () => {
  expect(describeFrequency(2, 1, 'd')).toBe('twice daily');
  expect(describeFrequency(1, 8, 'h')).toBe('every 8 hours');
  expect(describeFrequency(1, 1, 'wk')).toBe('once weekly');
});
