import { zipSync, strToU8 } from 'fflate';
import { describe, expect, test } from 'vitest';
import { parseBytes } from '@/parsers';
import { decodeChunks, isoDate, scanHealthExport } from '@/parsers/appleHealth/scan';
import { recordOf, sample } from './helpers';

const exportXml = sample('apple-health-export.xml');

describe('Apple Health export', () => {
  const record = recordOf(exportXml);
  const vital = (name: string) => record.vitals.find((v) => v.name === name);

  test('is recognized and converted to a FHIR-backed record', () => {
    expect(record.meta.format).toBe('apple-health');
    expect(record.meta.summary).toMatch(/^Apple Health · \d+ resources$/);
    expect(record.meta.fhirPath).toBe(true);
    expect(record.patient).toMatchObject({ dob: '1988-04-22', sex: 'female' });
    expect(record.meta.warnings.some((w) => w.severity === 'info' && w.message.startsWith('Converted from an Apple Health export'))).toBe(true);
  });

  test('shows the latest reading of each measurement', () => {
    expect(vital('Blood pressure')).toMatchObject({ unit: 'mmHg', date: expect.stringMatching(/^2025-09-30/) });
    expect(vital('Blood pressure')!.valueText).toMatch(/^\d{3}\/\d{2}$/);
    expect(vital('Oxygen saturation')).toMatchObject({ value: 96, unit: '%' });
    expect(vital('Resting heart rate')).toMatchObject({ unit: 'bpm' });
    expect(vital('Body weight')).toMatchObject({ value: 71.8, unit: 'kg' });
    expect(record.labs.find((l) => l.name === 'Blood group')?.valueText).toBe('O+');
  });

  test('averages daily totals without adding two devices together', () => {
    const steps = vital('Steps per day')!;
    expect(steps.unit).toBe('steps');
    // The watch counts about 6,400 a day; adding the phone on top would give nearly 12,000.
    expect(steps.value).toBeGreaterThan(5000);
    expect(steps.value).toBeLessThan(8000);
  });

  test('reads a tag that is cut in two between chunks', () => {
    const whole = scanHealthExport([exportXml]);
    const pieces = scanHealthExport(decodeChunks(strToU8(exportXml), 97));
    expect(pieces.records).toBe(whole.records);
    expect([...pieces.latest]).toEqual([...whole.latest]);
    expect(pieces.birthDate).toBe('1988-04-22');
  });

  test('converts Apple dates', () => {
    expect(isoDate('2025-01-09 08:00:00 +0100')).toBe('2025-01-09T08:00:00+01:00');
    expect(isoDate('1988-04-22')).toBe('1988-04-22');
    expect(isoDate('yesterday')).toBeUndefined();
  });

  test('opens export.zip and merges its clinical records', () => {
    const condition = { resourceType: 'Condition', id: 'c1', code: { text: 'Seasonal allergic rhinitis' }, clinicalStatus: { coding: [{ code: 'active' }] } };
    const zip = zipSync({
      'apple_health_export/export.xml': strToU8(exportXml),
      'apple_health_export/export_cda.xml': strToU8('<ClinicalDocument/>'.padEnd(exportXml.length * 2, ' ')),
      'apple_health_export/clinical-records/Condition-c1.json': strToU8(JSON.stringify(condition)),
      'apple_health_export/clinical-records/broken.json': strToU8('{'),
    });
    const { document } = parseBytes(zip);
    expect(document.record.meta.format).toBe('apple-health');
    expect(document.record.conditions.map((c) => c.name)).toEqual(['Seasonal allergic rhinitis']);
    expect(document.record.meta.warnings[0].message).toBe('Opened "apple_health_export/export.xml" from the Apple Health archive with 1 clinical record');
  });
});
