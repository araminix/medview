// Generates the synthetic International Patient Summary sample. Every person and identifier here is invented.
// Run: node scripts/build-ips-sample.mjs
import { writeFileSync } from 'node:fs';

const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const ATC = 'http://www.whocc.no/atc';
const ABSENT = 'http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips';
const PATIENT = { reference: 'urn:uuid:pat-devries', display: 'Anna de Vries' };
const concept = (system, code, display) => ({ coding: [{ system, code, display }], text: display });
const lab = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }];
const clinical = (code) => ({ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code }] });

const resources = [
  {
    resourceType: 'Patient', id: 'pat-devries',
    identifier: [{ type: { text: 'BSN' }, system: 'http://fhir.nl/fhir/NamingSystem/bsn', value: '999911120' }],
    name: [{ use: 'official', family: 'de Vries', given: ['Anna'] }],
    gender: 'female', birthDate: '1975-11-03',
    telecom: [{ system: 'phone', value: '+31 20 555 0142' }, { system: 'email', value: 'anna.devries@example.nl' }],
    address: [{ line: ['Keizersgracht 221'], city: 'Amsterdam', postalCode: '1016 DV', country: 'NL' }],
  },
  { resourceType: 'Practitioner', id: 'prac-jansen', name: [{ family: 'Jansen', given: ['Pieter'], prefix: ['Dr.'] }] },
  { resourceType: 'Organization', id: 'org-huisarts', name: 'Huisartsenpraktijk Jordaan' },
  { resourceType: 'AllergyIntolerance', id: 'alg-peanut', clinicalStatus: { coding: [{ code: 'active' }] }, criticality: 'high', code: concept(SNOMED, '91935009', 'Allergy to peanut'), patient: PATIENT, reaction: [{ manifestation: [concept(SNOMED, '39579001', 'Anaphylaxis')], severity: 'severe' }] },
  { resourceType: 'Condition', id: 'cond-thyroid', clinicalStatus: clinical('active'), code: concept(SNOMED, '40930008', 'Hypothyroidism'), subject: PATIENT, onsetDateTime: '2016-05-10' },
  { resourceType: 'Condition', id: 'cond-asthma', clinicalStatus: clinical('active'), code: concept(SNOMED, '195967001', 'Asthma'), subject: PATIENT, onsetDateTime: '1989-09-01' },
  { resourceType: 'Condition', id: 'cond-fracture', clinicalStatus: clinical('resolved'), code: concept(SNOMED, '263102004', 'Fracture of left wrist'), subject: PATIENT, onsetDateTime: '2019-01-20', abatementDateTime: '2019-04-02' },
  { resourceType: 'MedicationStatement', id: 'med-levo', status: 'active', medicationCodeableConcept: concept(ATC, 'H03AA01', 'Levothyroxine 75 microgram tablet'), subject: PATIENT, effectivePeriod: { start: '2016-05-17' }, dosage: [{ text: '1 tablet every morning', timing: { repeat: { frequency: 1, period: 1, periodUnit: 'd' } }, route: concept(SNOMED, '26643006', 'Oral'), doseAndRate: [{ doseQuantity: { value: 75, unit: 'ug' } }] }] },
  { resourceType: 'MedicationStatement', id: 'med-salbutamol', status: 'active', medicationCodeableConcept: concept(ATC, 'R03AC02', 'Salbutamol 100 microgram inhaler'), subject: PATIENT, effectivePeriod: { start: '2010-03-01' }, dosage: [{ text: '2 puffs when needed', asNeededBoolean: true, route: concept(SNOMED, '447694001', 'Inhalation') }] },
  { resourceType: 'Immunization', id: 'imm-tetanus', status: 'completed', vaccineCode: concept(ATC, 'J07AM01', 'Tetanus toxoid'), patient: PATIENT, occurrenceDateTime: '2019-01-20' },
  { resourceType: 'Immunization', id: 'imm-covid', status: 'completed', vaccineCode: concept(ATC, 'J07BN01', 'COVID-19 mRNA vaccine'), patient: PATIENT, occurrenceDateTime: '2023-10-12' },
  { resourceType: 'Procedure', id: 'proc-none', status: 'unknown', code: concept(ABSENT, 'no-known-procedures', 'No known procedures'), subject: PATIENT },
  { resourceType: 'Observation', id: 'obs-tsh', status: 'final', category: lab, code: concept(LOINC, '3016-3', 'Thyrotropin (TSH)'), subject: PATIENT, effectiveDateTime: '2025-09-04', valueQuantity: { value: 6.8, unit: 'mIU/L' }, referenceRange: [{ low: { value: 0.4 }, high: { value: 4.0 } }], interpretation: [{ coding: [{ code: 'H' }] }] },
  { resourceType: 'Observation', id: 'obs-ft4', status: 'final', category: lab, code: concept(LOINC, '14920-3', 'Free thyroxine (FT4)'), subject: PATIENT, effectiveDateTime: '2025-09-04', valueQuantity: { value: 13.1, unit: 'pmol/L' }, referenceRange: [{ low: { value: 10 }, high: { value: 23 } }] },
  { resourceType: 'Observation', id: 'obs-hb', status: 'final', category: lab, code: concept(LOINC, '718-7', 'Hemoglobin'), subject: PATIENT, effectiveDateTime: '2025-09-04', valueQuantity: { value: 8.4, unit: 'mmol/L' }, referenceRange: [{ low: { value: 7.5 }, high: { value: 10 } }] },
];

const section = (title, code, ids, narrative) => ({
  title, code: concept(LOINC, code, title),
  text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${narrative}</div>` },
  entry: ids.map((id) => ({ reference: `urn:uuid:${id}` })),
});

const composition = {
  resourceType: 'Composition', id: 'comp-ips',
  meta: { profile: ['http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips'] },
  status: 'final', type: concept(LOINC, '60591-5', 'Patient summary Document'),
  subject: PATIENT, date: '2025-09-05T10:20:00+02:00',
  author: [{ reference: 'urn:uuid:prac-jansen', display: 'Dr. Pieter Jansen' }],
  custodian: { reference: 'urn:uuid:org-huisarts', display: 'Huisartsenpraktijk Jordaan' },
  title: 'International Patient Summary',
  section: [
    section('Allergies and Intolerances', '48765-2', ['alg-peanut'], '<p>Severe peanut allergy (anaphylaxis). Carries an adrenaline auto-injector.</p>'),
    section('Medication Summary', '10160-0', ['med-levo', 'med-salbutamol'], '<ul><li>Levothyroxine 75 microgram, every morning</li><li>Salbutamol inhaler, when needed</li></ul>'),
    section('Problem List', '11450-4', ['cond-thyroid', 'cond-asthma'], '<p>Hypothyroidism since 2016; asthma since childhood, well controlled.</p>'),
    section('History of Past Illness', '11348-0', ['cond-fracture'], '<p>Left wrist fracture in 2019, healed.</p>'),
    section('Immunizations', '11369-6', ['imm-tetanus', 'imm-covid'], '<p>Tetanus booster 2019; COVID-19 vaccine 2023.</p>'),
    section('History of Procedures', '47519-4', ['proc-none'], '<p>No known procedures.</p>'),
    section('Results', '30954-2', ['obs-tsh', 'obs-ft4', 'obs-hb'], '<p>TSH slightly raised in September 2025; other results within range.</p>'),
  ],
};

const bundle = {
  resourceType: 'Bundle', id: 'ips-devries',
  meta: { profile: ['http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips'] },
  identifier: { system: 'urn:oid:2.16.528.1.1007.3.3', value: 'ips-2025-000142' },
  type: 'document', timestamp: '2025-09-05T10:20:00+02:00',
  entry: [composition, ...resources].map((resource) => ({ fullUrl: `urn:uuid:${resource.id}`, resource })),
};

writeFileSync(new URL('../src/samples/patient-summary.ips.json', import.meta.url), `${JSON.stringify(bundle, null, 2)}\n`);
