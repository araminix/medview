import { describe, expect, test } from 'vitest';
import { recordOf, sample } from './helpers';

describe('International Patient Summary (EU IPS)', () => {
  const record = recordOf(sample('patient-summary.ips.json'));

  test('is recognized as a patient summary on top of FHIR', () => {
    expect(record.meta.format).toBe('eu-ips');
    expect(record.meta.summary).toBe('IPS · FHIR R4 · 16 resources');
    expect(record.meta.fhirPath).toBe(true);
    expect(record.patient).toMatchObject({ name: 'Anna de Vries', dob: '1975-11-03', sex: 'female' });
  });

  test('reads the sections into the record', () => {
    expect(record.allergies.map((a) => a.substance)).toEqual(['Allergy to peanut']);
    expect(record.conditions.map((c) => `${c.name}:${c.status}`)).toEqual(['Hypothyroidism:active', 'Asthma:active', 'Fracture of left wrist:inactive']);
    expect(record.medications.map((m) => m.name)).toEqual(['Levothyroxine 75 microgram tablet', 'Salbutamol 100 microgram inhaler']);
    expect(record.immunizations).toHaveLength(2);
    expect(record.labs.find((l) => l.name.startsWith('Thyrotropin'))).toMatchObject({ value: 6.8, flag: 'high' });
    expect(record.documents.map((d) => d.title)).toContain('Problem List');
  });

  test('keeps "no known procedures" out of the procedure list and reports it', () => {
    expect(record.procedures).toEqual([]);
    expect(record.meta.warnings).toContainEqual(expect.objectContaining({ message: 'The file states: No known procedures', severity: 'info' }));
    expect(record.graph.nodes.some((n) => n.id === 'Procedure/proc-none')).toBe(false);
  });

  test('a plain FHIR bundle is not mistaken for a summary', () => {
    expect(recordOf(sample('complex-care.fhir.json')).meta.format).toBe('fhir-r4');
  });
});
