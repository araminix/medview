import { describe, expect, test } from 'vitest';
import { parseText } from '@/parsers';
import { recordOf, sample, warningsOf } from './helpers';

const bundle = sample('complex-care.fhir.json');

describe('FHIR R4 bundle (JSON)', () => {
  const record = recordOf(bundle);
  const hasEdge = (source: string, target: string) => record.graph.edges.some((e) => e.source === source && e.target === target);

  test('detects format and patient', () => {
    expect(record.meta.format).toBe('fhir-r4');
    expect(record.meta.summary).toBe('FHIR R4 · 50 resources');
    expect(record.patient).toMatchObject({ name: 'Marcus J. Delgado', dob: '1968-08-14', sex: 'male' });
    expect(record.patient.identifiers.map((i) => i.label)).toEqual(['MRN', 'SSN']);
  });

  test('extracts allergies, conditions, medications and encounters', () => {
    expect(record.allergies.map((a) => `${a.substance} — ${a.reaction}`)).toEqual(['Penicillin — Anaphylaxis', 'Latex — Skin rash']);
    expect(record.conditions).toHaveLength(6);
    expect(record.conditions.find((c) => c.name.startsWith('Pneumonia'))?.status).toBe('inactive');
    expect(record.medications[0]).toMatchObject({ name: 'Metformin 500 mg oral tablet', dosage: '500 mg — twice daily', status: 'active', prescriber: 'Dr. Ngozi Okafor' });
    expect(record.encounters.map((e) => e.kind)).toEqual(['Outpatient visit', 'Emergency visit', 'Outpatient visit']);
    expect(record.immunizations).toHaveLength(2);
    expect(record.procedures).toHaveLength(1);
  });

  test('separates labs from vitals and flags abnormal results', () => {
    expect(record.labs).toHaveLength(18);
    expect(record.vitals).toHaveLength(8);
    const a1c = record.labs.find((l) => l.name === 'Hemoglobin A1c');
    expect(a1c).toMatchObject({ value: 8.4, unit: '%', refLow: 4, refHigh: 5.6, flag: 'high', bodySystem: 'endocrine', panel: 'Diabetes' });
    expect(record.labs.find((l) => l.name === 'Potassium')?.flag).toBe('critical');
    expect(record.labs.find((l) => l.name === 'Creatinine')?.flag).toBe('normal');
    expect(record.vitals[0]).toMatchObject({ name: 'Blood pressure', valueText: '148/94', unit: 'mmHg', flag: 'high' });
  });

  test('builds reference edges for subject, encounter and requester', () => {
    expect(hasEdge('Patient/pat-delgado', 'Encounter/enc-1')).toBe(true);
    expect(hasEdge('Encounter/enc-1', 'Condition/cond-dm')).toBe(true);
    expect(hasEdge('Encounter/enc-1', 'Observation/obs-hba1c')).toBe(true);
    expect(hasEdge('Patient/pat-delgado', 'Observation/obs-hba1c')).toBe(false);
    expect(hasEdge('Patient/pat-delgado', 'MedicationRequest/med-metformin')).toBe(true);
    expect(hasEdge('MedicationRequest/med-metformin', 'Practitioner/prac-okafor')).toBe(true);
    expect(hasEdge('DiagnosticReport/rep-lipid', 'Observation/obs-ldl')).toBe(true);
  });

  test('reports dangling references instead of failing', () => {
    expect(warningsOf(bundle)).toEqual(['Unresolved reference: Practitioner/prac-991']);
  });

  test('exposes raw sources and the FHIRPath root', () => {
    const document = parseText(bundle);
    expect(JSON.parse(document.getSource('Patient/pat-delgado')!).resourceType).toBe('Patient');
    expect(document.fhirRoot).toMatchObject({ resourceType: 'Bundle' });
  });
});

describe('standalone resources', () => {
  test('a bare Patient parses without a Bundle', () => {
    const record = recordOf(JSON.stringify({ resourceType: 'Patient', id: 'p1', name: [{ family: 'Müller', given: ['Jörg'] }], birthDate: '1990-01-02' }));
    expect(record.patient.name).toBe('Jörg Müller');
    expect(record.meta.summary).toBe('FHIR R4 · Patient');
    expect(record.meta.warnings).toEqual([]);
  });

  test('a bare Observation parses and keeps its dangling subject silent', () => {
    const record = recordOf(
      JSON.stringify({
        resourceType: 'Observation',
        code: { text: 'Creatinine' },
        subject: { reference: 'Patient/absent' },
        valueQuantity: { value: 2.4, unit: 'mg/dL' },
        referenceRange: [{ text: '0.6-1.1' }],
      }),
    );
    expect(record.labs[0]).toMatchObject({ name: 'Creatinine', flag: 'high', refLow: 0.6, refHigh: 1.1, bodySystem: 'renal' });
    expect(record.meta.warnings).toEqual([]);
  });
});

describe('FHIR R5', () => {
  test('detects R5 and reads CodeableReference medications', () => {
    const record = recordOf(
      JSON.stringify({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          { resource: { resourceType: 'Patient', id: 'p', name: [{ text: 'Ada Example' }] } },
          { resource: { resourceType: 'Encounter', id: 'e', class: [{ coding: [{ code: 'IMP' }] }], subject: { reference: 'Patient/p' }, actualPeriod: { start: '2025-01-05' } } },
          { resource: { resourceType: 'MedicationRequest', id: 'm', status: 'active', subject: { reference: 'Patient/p' }, medication: { concept: { text: 'Apixaban 5 mg' } } } },
        ],
      }),
    );
    expect(record.meta.format).toBe('fhir-r5');
    expect(record.medications[0].name).toBe('Apixaban 5 mg');
    expect(record.encounters[0]).toMatchObject({ kind: 'Hospitalization', start: '2025-01-05' });
  });
});

describe('FHIR XML', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Bundle xmlns="http://hl7.org/fhir">
  <type value="collection"/>
  <entry>
    <fullUrl value="urn:uuid:11111111-1111-1111-1111-111111111111"/>
    <resource>
      <Patient>
        <id value="px"/>
        <text><status value="generated"/><div xmlns="http://www.w3.org/1999/xhtml"><p>Zoë Lefèvre</p></div></text>
        <name><family value="Lefèvre"/><given value="Zoë"/></name>
        <gender value="female"/>
        <birthDate value="1975-11-30"/>
      </Patient>
    </resource>
  </entry>
  <entry>
    <resource>
      <Observation>
        <id value="ox"/>
        <status value="final"/>
        <code><coding><system value="http://loinc.org"/><code value="718-7"/><display value="Hemoglobin"/></coding></code>
        <subject><reference value="urn:uuid:11111111-1111-1111-1111-111111111111"/></subject>
        <effectiveDateTime value="2025-02-01"/>
        <valueQuantity><value value="9.1"/><unit value="g/dL"/></valueQuantity>
        <referenceRange><low><value value="12.0"/></low><high><value value="15.5"/></high></referenceRange>
      </Observation>
    </resource>
  </entry>
</Bundle>`;

  test('parses a FHIR XML bundle through the same mapper', () => {
    const record = recordOf(xml);
    expect(record.meta).toMatchObject({ format: 'fhir-r4', syntax: 'xml' });
    expect(record.patient).toMatchObject({ name: 'Zoë Lefèvre', sex: 'female', dob: '1975-11-30' });
    expect(record.labs[0]).toMatchObject({ name: 'Hemoglobin', value: 9.1, flag: 'low', bodySystem: 'blood' });
    expect(record.graph.edges).toEqual([expect.objectContaining({ source: 'Patient/px', target: 'Observation/ox' })]);
  });

  test('keeps the original XML for the raw inspector', () => {
    expect(parseText(xml).getSource('Patient/px')).toContain('<family value="Lefèvre"/>');
  });

  test('a standalone XML resource parses', () => {
    expect(recordOf('<Patient xmlns="http://hl7.org/fhir"><name><text value="Solo Patient"/></name></Patient>').patient.name).toBe('Solo Patient');
  });
});
