import { describe, expect, test } from 'vitest';
import { tokenize, at } from '@/parsers/hl7v2/tokenizer';
import { recordOf, sample } from './helpers';

describe('HL7 v2 ORU^R01 lab result', () => {
  const record = recordOf(sample('messy-lab.hl7'));
  const lab = (name: string) => record.labs.find((l) => l.name === name);

  test('reads header, patient, visit and allergies', () => {
    expect(record.meta).toMatchObject({ format: 'hl7-v2', version: '2.5.1' });
    expect(record.meta.summary).toBe('HL7 v2.5.1 · ORU^R01 · 28 segments');
    expect(record.patient).toMatchObject({ name: 'Greta L Hartmann', dob: '1959-02-23', sex: 'female' });
    expect(record.patient.identifiers).toEqual([{ label: 'MRN', value: 'NG-7730155' }, { label: 'SSN', value: '000-45-6789' }]);
    expect(record.encounters[0]).toMatchObject({ kind: 'Outpatient visit', provider: 'Dr. Emil Brandt', start: '2025-04-11T06:45', location: 'NORTHGATE CLINIC' });
    expect(record.allergies.map((a) => [a.substance, a.severity, a.reaction])).toEqual([
      ['Penicillin', 'severe', 'Anaphylaxis'],
      ['Aspirin', 'moderate', 'Hives'],
    ]);
    expect(record.conditions.map((c) => c.bodySystem)).toEqual(['renal', 'blood']);
  });

  test('maps abnormal flags H, L, LL, A and N', () => {
    expect(lab('Glucose')?.flag).toBe('high');
    expect(lab('Calcium')?.flag).toBe('low');
    expect(lab('eGFR (CKD-EPI)')?.flag).toBe('critical');
    expect(lab('Urine protein')).toMatchObject({ flag: 'abnormal', valueText: 'Positive' });
    expect(lab('Sodium')?.flag).toBe('normal');
  });

  test('parses reference ranges 3.5-5.0, <35 and >60', () => {
    expect(lab('Potassium')).toMatchObject({ refLow: 3.5, refHigh: 5.1 });
    expect(lab('ALT')).toMatchObject({ refLow: undefined, refHigh: 35, flag: 'normal' });
    expect(lab('eGFR (CKD-EPI)')).toMatchObject({ refLow: 60, refHigh: undefined });
  });

  test('keeps non-numeric and comparator values', () => {
    expect(lab('Ferritin')).toMatchObject({ valueText: '<8', value: 8, flag: 'low' });
    expect(lab('Urine color')).toMatchObject({ valueText: 'Dark yellow', value: undefined });
    expect(lab('Bilirubin, total')).toMatchObject({ valueText: 'pending', flag: 'unknown' });
  });

  test('reports problems with their line numbers and still renders everything else', () => {
    expect(record.meta.warnings.map((w) => `Line ${w.line}: ${w.message}`)).toEqual([
      'Line 13: Missing unit on OBX-6',
      'Line 17: Non-numeric value "pending" in numeric OBX-5',
      'Line 23: Invalid date "20259911070000" in OBX-14',
      'Line 27: No result value in OBX-5 for "Hemoglobin A1c"',
    ]);
    expect(record.labs).toHaveLength(15);
    expect(record.documents[0].text).toContain('hemolyzed');
  });

  test('links patient → visit → order → results', () => {
    const edges = record.graph.edges.map((e) => `${e.source}>${e.target}`);
    expect(edges).toEqual(expect.arrayContaining(['PID[1]>PV1[1]', 'PV1[1]>OBR[1]', 'OBR[1]>OBX[1]', 'OBR[2]>OBX[9]', 'PID[1]>AL1[1]']));
  });
});

describe('HL7 v2 ADT^A01 admission', () => {
  // PV1-44 (admit time) sits far to the right; build the segment by field number.
  const pv1Fields = Array<string>(45).fill('');
  Object.assign(pv1Fields, { 0: 'PV1', 1: '1', 2: 'I', 3: '2000^2012^01', 7: '004777^Castro^Frank^J.', 10: 'SUR', 14: 'ADM', 44: '20250107081500' });
  const pv1 = pv1Fields.join('|');
  const adt = [
    'MSH|^~\\&|ADT1|GOOD HEALTH HOSPITAL|GHH LAB|GHH|20250107083000||ADT^A01^ADT_A01|MSG00001|P|2.6',
    'EVN|A01|20250107083000',
    'PID|1||PATID1234^5^M11^ADT1^MR||Everyman^Adam^A^III||19610615|M||C|2222 Home Street^^Greensboro^NC^27401||(555) 019-1212',
    'NK1|1|Everyman^Nelda^W|SPO',
    pv1,
    'AL1|1||^Shellfish||Swelling~Wheezing',
    'DG1|1||K35.80^Unspecified acute appendicitis^I10|||A',
  ].join('\r');
  const record = recordOf(adt);

  test('splits MSH/EVN/PID/NK1/PV1/AL1/DG1 on carriage returns', () => {
    expect(record.sources.map((s) => s.type)).toEqual(['MSH', 'EVN', 'PID', 'NK1', 'PV1', 'AL1', 'DG1']);
    expect(record.meta.summary).toContain('ADT^A01');
    expect(record.patient).toMatchObject({ name: 'Adam A Everyman III', sex: 'male' });
    expect(record.encounters[0]).toMatchObject({ kind: 'Hospitalization', provider: 'Frank J. Castro', start: '2025-01-07T08:15' });
    expect(record.allergies[0]).toMatchObject({ substance: 'Shellfish', reaction: 'Swelling, Wheezing' });
    expect(record.conditions[0]).toMatchObject({ name: 'Unspecified acute appendicitis', bodySystem: 'gi' });
  });
});

describe('HL7 v2 delimiters and escapes', () => {
  test('honours custom separators declared in MSH', () => {
    const custom = ['MSH#*~\\&#LAB#HOSP###20250101##ORU*R01#1#P#2.3', 'PID#1##777*MR##Okonkwo*Chidi', 'OBX#1#NM#718-7*Hemoglobin*LN##11.2#g/dL#12.0-15.5#L'].join('\n');
    const record = recordOf(custom);
    expect(record.patient.name).toBe('Chidi Okonkwo');
    expect(record.labs[0]).toMatchObject({ name: 'Hemoglobin', value: 11.2, flag: 'low' });
    expect(record.meta.summary).toContain('ORU^R01');
  });

  test('unescapes \\F\\, \\S\\ and \\T\\ sequences', () => {
    const [, obx] = tokenize('MSH|^~\\&|A|B\rOBX|1|ST|1^Note||Ratio 1\\S\\2 \\T\\ pipe \\F\\ done');
    expect(at(obx, 5)).toBe('Ratio 1^2 & pipe | done');
  });

  test('parses a message that lacks its MSH header with a warning', () => {
    const record = recordOf('PID|1||555^^^^MR||Nakamura^Yuki\nOBX|1|NM|2345-7^Glucose^LN||91|mg/dL|70-99|N');
    expect(record.patient.name).toBe('Yuki Nakamura');
    expect(record.meta.warnings[0].message).toBe('Message does not start with an MSH segment');
  });
});
