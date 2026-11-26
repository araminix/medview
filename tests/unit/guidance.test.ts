import { describe, expect, test } from 'vitest';
import { medicinePurpose } from '@/domain/guidance/medicines';
import { buildPlainSummary, redFlag } from '@/domain/guidance/summarize';
import { TOPICS } from '@/domain/guidance/topics';
import type { LabItem } from '@/domain/types';
import { recordOf, sample } from './helpers';

const lab = (name: string, value: number, extra: Partial<LabItem> = {}): LabItem => ({
  id: name, codes: [], name, value, valueText: String(value), flag: 'high', bodySystem: 'general', ...extra,
});

describe('plain summary of the sample files', () => {
  test('FHIR sample: critical potassium leads, followed by everyday problems', () => {
    const summary = buildPlainSummary(recordOf(sample('complex-care.fhir.json')));
    expect(summary.overall).toBe('emergency');
    expect(summary.findings[0]).toMatchObject({ id: 'potassium', urgency: 'emergency', urgentReason: 'The laboratory marked this result as critical.' });
    expect(summary.findings.map((f) => f.id)).toEqual(expect.arrayContaining(['blood-sugar', 'blood-pressure', 'cholesterol', 'kidneys', 'joints', 'weight']));
    const sugar = summary.findings.find((f) => f.id === 'blood-sugar')!;
    expect(sugar.urgency).toBe('soon');
    expect(sugar.evidence.map((e) => e.label)).toEqual([
      'Diagnosis on record: Type 2 diabetes mellitus without complications',
      'Average blood sugar over 3 months (HbA1c): 8.4 %',
      'Blood sugar (glucose): 162 mg/dL',
    ]);
    expect(sugar.evidence[1].detail).toBe('higher than the usual range (4 – 5.6)');
  });

  test('only the latest blood pressure counts', () => {
    // The newest reading in the sample (134/84) is in range, so no pressure reading is cited.
    const pressure = buildPlainSummary(recordOf(sample('complex-care.fhir.json'))).findings.find((f) => f.id === 'blood-pressure')!;
    expect(pressure.urgency).toBe('routine');
    expect(pressure.evidence).toHaveLength(1);
  });

  test('C-CDA sample: heart, kidney and anemia findings', () => {
    const summary = buildPlainSummary(recordOf(sample('discharge-summary.ccda.xml')));
    expect(summary.overall).toBe('emergency');
    expect(summary.findings.map((f) => f.id)).toEqual(expect.arrayContaining(['heart-failure', 'heart-attack-marker', 'heart-rhythm', 'kidneys', 'anemia', 'sodium', 'blood-sugar']));
    expect(summary.findings.find((f) => f.id === 'heart-failure')!.urgency).toBe('emergency');
    expect(summary.findings.find((f) => f.id === 'anemia')!.urgency).toBe('soon');
  });

  test('HL7 sample: unexplained results are listed, not dropped', () => {
    const summary = buildPlainSummary(recordOf(sample('messy-lab.hl7')));
    expect(summary.findings.map((f) => f.id)).toEqual(expect.arrayContaining(['kidneys', 'anemia', 'potassium']));
    expect(summary.otherResults.map((e) => e.label)).toEqual(expect.arrayContaining(['Calcium: 8.2 mg/dL', 'Urine protein: Positive']));
  });

  test('a healthy record is reported as clear', () => {
    const record = recordOf(JSON.stringify({ resourceType: 'Patient', name: [{ text: 'Well Person' }] }));
    expect(buildPlainSummary(record)).toEqual({ findings: [], overall: 'clear', otherConditions: [], otherResults: [] });
  });
});

describe('red flags', () => {
  test.each([
    ['Potassium', 6.2, {}, true],
    ['Potassium', 5.4, {}, false],
    ['Potassium', 2.4, { flag: 'low' as const }, true],
    ['Sodium', 118, { flag: 'low' as const }, true],
    ['Glucose', 420, { unit: 'mg/dL' }, true],
    ['Glucose', 162, { unit: 'mg/dL' }, false],
    ['Glucose', 2.6, { unit: 'mmol/L', flag: 'low' as const }, true],
    ['Glucose', 9, { unit: 'mmol/L' }, false],
    ['Hemoglobin', 6.5, { unit: 'g/dL', flag: 'low' as const }, true],
    ['Hemoglobin', 98, { unit: 'g/L', flag: 'low' as const }, false],
    ['Hemoglobin A1c', 6.9, { unit: '%' }, false],
    ['Troponin I', 40, {}, true],
    ['eGFR', 12, { flag: 'low' as const }, true],
    ['Anything', 1, { flag: 'critical' as const }, true],
  ])('%s %s → urgent: %s', (name, value, extra, urgent) => {
    expect(Boolean(redFlag(lab(name, value, extra)))).toBe(urgent);
  });
});

describe('safety of the advice itself', () => {
  const advice = TOPICS.flatMap((t) => t.selfCare).join('\n');

  test('never tells the reader to start, stop or dose a medicine on their own', () => {
    // Medicines appear only as "ask first" or "take as prescribed" — never as a recommendation.
    for (const line of advice.split('\n').filter((l) => /tablet|pill|supplement|ibuprofen|naproxen|painkiller|medicine|pain relief|inhaler/i.test(l))) {
      expect(line, line).toMatch(/ask|unless your doctor|as prescribed|as instructed|as shown|tell (the|every)|within the dose|on your own|every day/i);
    }
  });

  test('every topic explains itself and offers something to do and to ask', () => {
    for (const topic of TOPICS) {
      expect(topic.meaning.length, topic.id).toBeGreaterThan(40);
      expect(topic.selfCare.length, topic.id).toBeGreaterThan(0);
      expect(topic.askDoctor.length, topic.id).toBeGreaterThan(0);
    }
  });
});

test('explains what common medicines are for', () => {
  expect(medicinePurpose('Metformin 500 mg oral tablet')).toBe('helps lower blood sugar');
  expect(medicinePurpose('Atorvastatin 40 mg')).toBe('lowers cholesterol');
  expect(medicinePurpose('Warfarin sodium 5 mg')).toBe('a blood thinner that prevents clots');
  expect(medicinePurpose('Unknownium 5 mg')).toBeUndefined();
});
