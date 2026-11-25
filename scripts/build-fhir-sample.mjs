// Generates the synthetic "Complex Care Bundle" sample. Every person and identifier here is invented.
// Run: node scripts/build-fhir-sample.mjs
import { writeFileSync } from 'node:fs';

const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm';
const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const PATIENT = { reference: 'Patient/pat-delgado', display: 'Marcus J. Delgado' };
const DOCTOR = { reference: 'Practitioner/prac-okafor', display: 'Dr. Ngozi Okafor' };

const concept = (system, code, display) => ({ coding: [{ system, code, display }], text: display });
const category = (code, display) => [
  { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code, display }] },
];
const interpretation = (code) => [
  { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code }] },
];

const encounters = [
  ['enc-1', 'AMB', 'Annual diabetes review', '2025-03-12T09:00:00Z', '2025-03-12T09:40:00Z'],
  ['enc-2', 'EMER', 'Emergency visit — chest tightness', '2025-06-02T22:15:00Z', '2025-06-03T03:30:00Z'],
  ['enc-3', 'AMB', 'Cardiology follow-up', '2025-09-18T14:00:00Z', '2025-09-18T14:30:00Z'],
].map(([id, cls, text, start, end]) => ({
  resourceType: 'Encounter',
  id,
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: cls },
  type: [{ text }],
  subject: PATIENT,
  participant: [{ individual: DOCTOR }],
  period: { start, end },
  serviceProvider: { reference: 'Organization/org-riverside', display: 'Riverside Community Hospital' },
}));

const conditions = [
  ['cond-dm', 'E11.9', 'Type 2 diabetes mellitus without complications', 'active', '2016-05-10', 'enc-1'],
  ['cond-htn', 'I10', 'Essential (primary) hypertension', 'active', '2014-11-02', 'enc-3'],
  ['cond-lipid', 'E78.5', 'Hyperlipidemia, unspecified', 'active', '2017-01-20', 'enc-1'],
  ['cond-ckd', 'N18.2', 'Chronic kidney disease, stage 2 (mild)', 'active', '2023-08-14', 'enc-1'],
  ['cond-oa', 'M17.11', 'Unilateral primary osteoarthritis, right knee', 'active', '2021-03-03', null],
  ['cond-pna', 'J18.9', 'Pneumonia, unspecified organism', 'resolved', '2022-12-05', null],
].map(([id, code, display, status, onset, enc]) => ({
  resourceType: 'Condition',
  id,
  clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: status }] },
  code: concept(ICD10, code, display),
  subject: PATIENT,
  ...(enc ? { encounter: { reference: `Encounter/${enc}` } } : {}),
  onsetDateTime: onset,
  ...(status === 'resolved' ? { abatementDateTime: '2023-01-10' } : {}),
}));

// [id, loinc, name, value, unit, low, high, flag, date, encounter]
const labs = [
  ['hba1c', '4548-4', 'Hemoglobin A1c', 8.4, '%', 4.0, 5.6, 'H', '2025-03-12', 'enc-1'],
  ['glucose', '2345-7', 'Glucose [Mass/volume] in Serum or Plasma', 162, 'mg/dL', 70, 99, 'H', '2025-03-12', 'enc-1'],
  ['ldl', '13457-7', 'LDL Cholesterol (calculated)', 148, 'mg/dL', 0, 100, 'H', '2025-03-12', 'enc-1'],
  ['hdl', '2085-9', 'HDL Cholesterol', 38, 'mg/dL', 40, 60, 'L', '2025-03-12', 'enc-1'],
  ['chol', '2093-3', 'Cholesterol, Total', 224, 'mg/dL', 0, 200, 'H', '2025-03-12', 'enc-1'],
  ['trig', '2571-8', 'Triglycerides', 142, 'mg/dL', 0, 150, 'N', '2025-03-12', 'enc-1'],
  ['creat', '2160-0', 'Creatinine', 1.1, 'mg/dL', 0.7, 1.3, 'N', '2025-03-12', 'enc-1'],
  ['egfr', '33914-3', 'eGFR (CKD-EPI)', 74, 'mL/min/1.73m2', 90, null, 'L', '2025-03-12', 'enc-1'],
  ['alt', '1742-6', 'ALT (Alanine aminotransferase)', 31, 'U/L', 7, 56, 'N', '2025-03-12', 'enc-1'],
  ['ast', '1920-8', 'AST (Aspartate aminotransferase)', 28, 'U/L', 10, 40, 'N', '2025-03-12', 'enc-1'],
  ['tsh', '3016-3', 'TSH (Thyrotropin)', 2.1, 'mIU/L', 0.4, 4.0, 'N', '2025-03-12', 'enc-1'],
  ['hgb', '718-7', 'Hemoglobin', 14.2, 'g/dL', 13.5, 17.5, 'N', '2025-06-02', 'enc-2'],
  ['wbc', '6690-2', 'WBC (Leukocytes)', 7.8, '10*3/uL', 4.5, 11.0, 'N', '2025-06-02', 'enc-2'],
  ['plt', '777-3', 'Platelets', 245, '10*3/uL', 150, 400, 'N', '2025-06-02', 'enc-2'],
  ['trop', '89579-7', 'Troponin I, high sensitivity', 9, 'ng/L', 0, 20, 'N', '2025-06-02', 'enc-2'],
  ['bnp', '30934-4', 'BNP (Natriuretic peptide B)', 48, 'pg/mL', 0, 100, 'N', '2025-06-02', 'enc-2'],
  ['k', '2823-3', 'Potassium', 5.9, 'mmol/L', 3.5, 5.1, 'HH', '2025-06-02', 'enc-2'],
  ['na', '2951-2', 'Sodium', 139, 'mmol/L', 136, 145, 'N', '2025-06-02', 'enc-2'],
].map(([id, code, name, value, unit, low, high, flag, date, enc]) => ({
  resourceType: 'Observation',
  id: `obs-${id}`,
  status: 'final',
  category: category('laboratory', 'Laboratory'),
  code: concept(LOINC, code, name),
  subject: PATIENT,
  encounter: { reference: `Encounter/${enc}` },
  effectiveDateTime: `${date}T08:30:00Z`,
  valueQuantity: { value, unit, system: 'http://unitsofmeasure.org' },
  interpretation: interpretation(flag),
  referenceRange: [{ ...(low !== null ? { low: { value: low, unit } } : {}), ...(high !== null ? { high: { value: high, unit } } : {}) }],
}));

const vital = (id, code, name, value, unit, date, enc) => ({
  resourceType: 'Observation',
  id: `vit-${id}`,
  status: 'final',
  category: category('vital-signs', 'Vital Signs'),
  code: concept(LOINC, code, name),
  subject: PATIENT,
  encounter: { reference: `Encounter/${enc}` },
  effectiveDateTime: date,
  valueQuantity: { value, unit },
});

const bloodPressure = (id, systolic, diastolic, date, enc, flag) => ({
  resourceType: 'Observation',
  id: `vit-${id}`,
  status: 'final',
  category: category('vital-signs', 'Vital Signs'),
  code: concept(LOINC, '85354-9', 'Blood pressure'),
  subject: PATIENT,
  encounter: { reference: `Encounter/${enc}` },
  effectiveDateTime: date,
  ...(flag ? { interpretation: interpretation(flag) } : {}),
  component: [
    { code: concept(LOINC, '8480-6', 'Systolic blood pressure'), valueQuantity: { value: systolic, unit: 'mmHg' } },
    { code: concept(LOINC, '8462-4', 'Diastolic blood pressure'), valueQuantity: { value: diastolic, unit: 'mmHg' } },
  ],
});

const vitals = [
  bloodPressure('bp-1', 148, 94, '2025-03-12T09:05:00Z', 'enc-1', 'H'),
  bloodPressure('bp-2', 162, 98, '2025-06-02T22:20:00Z', 'enc-2', 'H'),
  bloodPressure('bp-3', 134, 84, '2025-09-18T14:05:00Z', 'enc-3'),
  vital('hr-1', '8867-4', 'Heart rate', 78, '/min', '2025-03-12T09:05:00Z', 'enc-1'),
  vital('hr-2', '8867-4', 'Heart rate', 104, '/min', '2025-06-02T22:20:00Z', 'enc-2'),
  vital('spo2', '2708-6', 'Oxygen saturation', 97, '%', '2025-06-02T22:20:00Z', 'enc-2'),
  vital('weight', '29463-7', 'Body weight', 96.4, 'kg', '2025-03-12T09:05:00Z', 'enc-1'),
  vital('bmi', '39156-5', 'Body mass index (BMI)', 31.2, 'kg/m2', '2025-03-12T09:05:00Z', 'enc-1'),
];

// [id, rxnorm, name, dose, unit, frequency, status, date]
const medications = [
  ['metformin', '861007', 'Metformin 500 mg oral tablet', 500, 'mg', 2, 'active', '2016-05-10'],
  ['lisinopril', '314076', 'Lisinopril 10 mg oral tablet', 10, 'mg', 1, 'active', '2014-11-02'],
  ['atorvastatin', '617311', 'Atorvastatin 40 mg oral tablet', 40, 'mg', 1, 'active', '2025-03-12'],
  ['empagliflozin', '1545653', 'Empagliflozin 10 mg oral tablet', 10, 'mg', 1, 'active', '2025-03-12'],
  ['aspirin', '243670', 'Aspirin 81 mg oral tablet', 81, 'mg', 1, 'active', '2025-06-03'],
  ['amoxicillin', '308182', 'Amoxicillin 500 mg oral capsule', 500, 'mg', 3, 'completed', '2022-12-05'],
].map(([id, code, name, dose, unit, frequency, status, date]) => ({
  resourceType: 'MedicationRequest',
  id: `med-${id}`,
  status,
  intent: 'order',
  medicationCodeableConcept: concept(RXNORM, code, name),
  subject: PATIENT,
  authoredOn: date,
  requester: DOCTOR,
  dosageInstruction: [
    {
      timing: { repeat: { frequency, period: 1, periodUnit: 'd' } },
      route: concept(SNOMED, '26643006', 'Oral route'),
      doseAndRate: [{ doseQuantity: { value: dose, unit } }],
    },
  ],
}));

const resources = [
  {
    resourceType: 'Patient',
    id: 'pat-delgado',
    text: { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml">Marcus J. Delgado, born 14 Aug 1968</div>' },
    identifier: [
      { type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }], text: 'MRN' }, value: 'MRN-48213907' },
      { type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'SS' }], text: 'SSN' }, value: '000-12-3456' },
    ],
    name: [{ use: 'official', family: 'Delgado', given: ['Marcus', 'J.'] }],
    telecom: [
      { system: 'phone', value: '(555) 014-2290', use: 'mobile' },
      { system: 'email', value: 'marcus.delgado@example.org' },
    ],
    gender: 'male',
    birthDate: '1968-08-14',
    address: [{ line: ['2417 Alder Creek Road'], city: 'Portland', state: 'OR', postalCode: '97205', country: 'US' }],
    contact: [{ relationship: [{ text: 'Spouse' }], name: { family: 'Delgado', given: ['Renata'] }, telecom: [{ system: 'phone', value: '(555) 014-7781' }] }],
  },
  { resourceType: 'Practitioner', id: 'prac-okafor', name: [{ family: 'Okafor', given: ['Ngozi'], prefix: ['Dr.'] }] },
  { resourceType: 'Organization', id: 'org-riverside', name: 'Riverside Community Hospital' },
  {
    resourceType: 'AllergyIntolerance',
    id: 'alg-penicillin',
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
    criticality: 'high',
    code: concept(RXNORM, '7980', 'Penicillin'),
    patient: PATIENT,
    reaction: [{ manifestation: [concept(SNOMED, '39579001', 'Anaphylaxis')], severity: 'severe' }],
  },
  {
    resourceType: 'AllergyIntolerance',
    id: 'alg-latex',
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
    code: concept(SNOMED, '111088007', 'Latex'),
    patient: PATIENT,
    reaction: [{ manifestation: [concept(SNOMED, '271807003', 'Skin rash')], severity: 'mild' }],
  },
  ...encounters,
  ...conditions,
  ...labs,
  ...vitals,
  ...medications,
  {
    resourceType: 'DiagnosticReport',
    id: 'rep-lipid',
    status: 'final',
    code: concept(LOINC, '57698-3', 'Lipid panel with direct LDL'),
    subject: PATIENT,
    encounter: { reference: 'Encounter/enc-1' },
    effectiveDateTime: '2025-03-12T08:30:00Z',
    performer: [{ reference: 'Organization/org-riverside' }],
    result: ['ldl', 'hdl', 'chol', 'trig'].map((id) => ({ reference: `Observation/obs-${id}` })),
    conclusion: 'LDL above goal for a patient with diabetes. Statin intensity increased.',
  },
  {
    resourceType: 'Immunization',
    id: 'imm-flu',
    status: 'completed',
    vaccineCode: concept('http://hl7.org/fhir/sid/cvx', '158', 'Influenza, injectable, quadrivalent'),
    patient: PATIENT,
    occurrenceDateTime: '2024-10-08',
  },
  {
    resourceType: 'Immunization',
    id: 'imm-covid',
    status: 'completed',
    vaccineCode: concept('http://hl7.org/fhir/sid/cvx', '300', 'COVID-19, mRNA, bivalent'),
    patient: PATIENT,
    occurrenceDateTime: '2023-11-15',
  },
  {
    resourceType: 'Procedure',
    id: 'proc-ecg',
    status: 'completed',
    code: concept(SNOMED, '29303009', 'Electrocardiographic procedure'),
    subject: PATIENT,
    encounter: { reference: 'Encounter/enc-2' },
    performedDateTime: '2025-06-02T22:40:00Z',
    // Deliberately dangling: shows up as a parse warning.
    performer: [{ actor: { reference: 'Practitioner/prac-991' } }],
  },
];

const bundle = {
  resourceType: 'Bundle',
  id: 'medview-sample-complex-care',
  type: 'collection',
  timestamp: '2025-09-18T15:00:00Z',
  entry: resources.map((resource) => ({ fullUrl: `https://example.org/fhir/${resource.resourceType}/${resource.id}`, resource })),
};

writeFileSync(new URL('../src/samples/complex-care.fhir.json', import.meta.url), `${JSON.stringify(bundle, null, 2)}\n`);
console.log(`Wrote ${resources.length} resources`);
