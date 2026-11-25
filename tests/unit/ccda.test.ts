import { describe, expect, test } from 'vitest';
import { parseText } from '@/parsers';
import { recordOf, sample } from './helpers';

describe('US C-CDA discharge summary', () => {
  const xml = sample('discharge-summary.ccda.xml');
  const record = recordOf(xml);

  test('reads <recordTarget>', () => {
    expect(record.meta).toMatchObject({ format: 'ccda', syntax: 'xml' });
    expect(record.patient).toMatchObject({ name: 'Eleanor M. Whitfield', dob: '1957-03-09', sex: 'female' });
    expect(record.patient.identifiers).toEqual([{ label: 'MRN', value: 'LGH-00391827' }, { label: 'SSN', value: '000-78-9012' }]);
    expect(record.patient.contacts).toContain('1420 Harbor View Drive, Duluth, MN, 55802, US');
  });

  test('allergies section 48765-2', () => {
    expect(record.allergies.map((a) => [a.substance, a.reaction, a.severity])).toEqual([
      ['Penicillin', 'Anaphylaxis', 'severe'],
      ['Latex', 'Contact dermatitis', 'moderate'],
    ]);
  });

  test('medications section 10160-0', () => {
    expect(record.medications).toHaveLength(6);
    expect(record.medications.find((m) => m.name.startsWith('Metformin'))).toMatchObject({ dosage: '500 mg — twice daily', status: 'active', route: 'Oral' });
    expect(record.medications.find((m) => m.name.startsWith('Ibuprofen'))).toMatchObject({ dosage: '400 mg — three times daily', status: 'inactive' });
  });

  test('problems section 11450-4', () => {
    expect(record.conditions.map((c) => c.bodySystem)).toEqual(['cardio', 'cardio', 'renal', 'endocrine', 'blood', 'gi']);
    expect(record.conditions.at(-1)).toMatchObject({ status: 'inactive', resolved: '2018-09-30' });
    expect(record.conditions[0].codes[0]).toMatchObject({ code: 'I50.23', system: 'ICD-10' });
  });

  test('results section 30954-2', () => {
    expect(record.labs).toHaveLength(13);
    expect(record.labs.find((l) => l.name === 'NT-proBNP')).toMatchObject({ value: 4820, refHigh: 125, flag: 'critical', bodySystem: 'cardio' });
    expect(record.labs.find((l) => l.name === 'Hemoglobin')).toMatchObject({ flag: 'low', refLow: 12, refHigh: 15.5, panel: 'Complete Blood Count' });
  });

  test('vitals section 8716-3 and remaining sections', () => {
    expect(record.vitals.map((v) => v.name)).toContain('Systolic blood pressure');
    expect(record.encounters[0]).toMatchObject({ kind: 'Hospitalization', provider: 'Dr. Samuel Achterberg', start: '2025-06-15T18:45' });
    expect(record.immunizations).toHaveLength(2);
    expect(record.procedures.map((p) => p.name)).toEqual(['Echocardiography', 'Electrocardiographic procedure']);
    expect(record.documents[0]).toMatchObject({ title: 'Hospital Course' });
  });

  test('raw sources serialize back to XML', () => {
    const document = parseText(xml);
    const allergy = record.allergies[0].sourceId!;
    expect(document.getSource(allergy)).toContain('displayName="Penicillin"');
  });

  test('resolves originalText references into the narrative', () => {
    const referenced = xml.replace('code="7980" displayName="Penicillin"', 'code="7980"');
    expect(recordOf(referenced).allergies[0].substance).toBe('Penicillin');
  });
});
