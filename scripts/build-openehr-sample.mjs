// Generates the synthetic openEHR composition sample (canonical JSON). Every person and identifier here is invented.
// Run: node scripts/build-openehr-sample.mjs
import { writeFileSync } from 'node:fs';

const text = (value) => ({ _type: 'DV_TEXT', value });
const coded = (value, terminology, code) => ({ _type: 'DV_CODED_TEXT', value, defining_code: { _type: 'CODE_PHRASE', terminology_id: { _type: 'TERMINOLOGY_ID', value: terminology }, code_string: code } });
const quantity = (magnitude, units, range, status) => ({
  _type: 'DV_QUANTITY', magnitude, units,
  ...(range ? { normal_range: { _type: 'DV_INTERVAL', lower: { _type: 'DV_QUANTITY', magnitude: range[0], units }, upper: { _type: 'DV_QUANTITY', magnitude: range[1], units } } } : {}),
  ...(status ? { normal_status: { _type: 'CODE_PHRASE', terminology_id: { _type: 'TERMINOLOGY_ID', value: 'openehr_normal_statuses' }, code_string: status } } : {}),
});
const dateTime = (value) => ({ _type: 'DV_DATE_TIME', value });
let at = 0;
const element = (name, value) => ({ _type: 'ELEMENT', name: text(name), archetype_node_id: `at${String((at += 1)).padStart(4, '0')}`, value });
const cluster = (name, archetype, items) => ({ _type: 'CLUSTER', name: text(name), archetype_node_id: archetype, items });
const tree = (items) => ({ _type: 'ITEM_TREE', name: text('Tree'), archetype_node_id: 'at0003', items });
const TIME = '2025-10-14T09:35:00+02:00';

const observation = (name, concept, items) => ({
  _type: 'OBSERVATION', name: text(name), archetype_node_id: `openEHR-EHR-OBSERVATION.${concept}`,
  language: { terminology_id: { value: 'ISO_639-1' }, code_string: 'en' },
  subject: { _type: 'PARTY_SELF' },
  data: { _type: 'HISTORY', name: text('History'), archetype_node_id: 'at0001', origin: dateTime(TIME), events: [{ _type: 'POINT_EVENT', name: text('Any event'), archetype_node_id: 'at0002', time: dateTime(TIME), data: tree(items) }] },
});
const evaluation = (name, concept, items) => ({ _type: 'EVALUATION', name: text(name), archetype_node_id: `openEHR-EHR-EVALUATION.${concept}`, subject: { _type: 'PARTY_SELF' }, data: tree(items) });
const analyte = (name, loinc, value) => cluster('Laboratory analyte result', 'openEHR-EHR-CLUSTER.laboratory_test_analyte.v1', [element('Analyte name', coded(name, 'LOINC', loinc)), element('Analyte result', value)]);
const section = (name, items) => ({ _type: 'SECTION', name: text(name), archetype_node_id: 'openEHR-EHR-SECTION.adhoc.v1', items });

const composition = {
  _type: 'COMPOSITION',
  name: text('Diabetes review'),
  archetype_node_id: 'openEHR-EHR-COMPOSITION.encounter.v1',
  uid: { _type: 'OBJECT_VERSION_ID', value: '8f2c1c4e-6b1e-4f0a-9d5e-2a7d1b3c9e10::ehr.medview.example::1' },
  archetype_details: { archetype_id: { value: 'openEHR-EHR-COMPOSITION.encounter.v1' }, template_id: { value: 'medview.diabetes_review.v1' }, rm_version: '1.0.4' },
  language: { terminology_id: { value: 'ISO_639-1' }, code_string: 'en' },
  territory: { terminology_id: { value: 'ISO_3166-1' }, code_string: 'SE' },
  category: coded('event', 'openehr', '433'),
  composer: { _type: 'PARTY_IDENTIFIED', name: 'Dr. Ingrid Bergström', identifiers: [{ _type: 'DV_IDENTIFIER', id: 'SE-HSA-771204', issuer: 'HSA', type: 'HSA-id' }] },
  context: {
    _type: 'EVENT_CONTEXT', start_time: dateTime('2025-10-14T09:30:00+02:00'), end_time: dateTime('2025-10-14T10:00:00+02:00'),
    setting: coded('primary medical care', 'openehr', '228'),
    health_care_facility: { _type: 'PARTY_IDENTIFIED', name: 'Vårdcentralen Södermalm', identifiers: [{ _type: 'DV_IDENTIFIER', id: 'SE2321000016-1HZ3', issuer: 'HSA', type: 'HSA-id' }] },
  },
  content: [
    section('Vital signs', [
      observation('Blood pressure', 'blood_pressure.v2', [element('Systolic', quantity(152, 'mm[Hg]')), element('Diastolic', quantity(96, 'mm[Hg]'))]),
      observation('Pulse', 'pulse.v2', [element('Rate', quantity(88, '/min'))]),
      observation('Body temperature', 'body_temperature.v2', [element('Temperature', quantity(37.2, 'Cel'))]),
      observation('Body weight', 'body_weight.v2', [element('Weight', quantity(94.5, 'kg'))]),
      observation('Pulse oximetry', 'pulse_oximetry.v1', [element('SpO₂', { _type: 'DV_PROPORTION', numerator: 97, denominator: 100, type: 2 })]),
    ]),
    section('Laboratory', [
      observation('Laboratory test result', 'laboratory_test_result.v1', [
        element('Test name', text('Diabetes follow-up panel')),
        analyte('Hemoglobin A1c', '4548-4', quantity(61, 'mmol/mol', [27, 42], 'H')),
        analyte('Creatinine', '14682-9', quantity(78, 'umol/L', [60, 105], 'N')),
        analyte('LDL cholesterol', '22748-8', quantity(3.9, 'mmol/L', [0, 3], 'H')),
      ]),
    ]),
    section('Problems and allergies', [
      evaluation('Problem/Diagnosis', 'problem_diagnosis.v1', [element('Problem/Diagnosis name', coded('Type 2 diabetes mellitus', 'SNOMED-CT', '44054006')), element('Date/time of onset', dateTime('2019-03-01')), element('Comment', text('HbA1c above target for the second visit in a row.'))]),
      evaluation('Problem/Diagnosis', 'problem_diagnosis.v1', [element('Problem/Diagnosis name', coded('Essential hypertension', 'SNOMED-CT', '59621000')), element('Date/time of onset', dateTime('2021-06-15'))]),
      evaluation('Adverse reaction risk', 'adverse_reaction_risk.v1', [element('Substance', coded('Amoxicillin', 'SNOMED-CT', '372687004')), element('Criticality', text('Low')), cluster('Reaction event', 'at0009', [element('Manifestation', text('Skin rash')), element('Severity', text('Mild'))])]),
    ]),
    section('Medication', [
      {
        _type: 'INSTRUCTION', name: text('Medication order'), archetype_node_id: 'openEHR-EHR-INSTRUCTION.medication_order.v3', subject: { _type: 'PARTY_SELF' },
        narrative: text('Metformin 1000 mg tablet, twice daily with meals'),
        activities: [{ _type: 'ACTIVITY', name: text('Order'), archetype_node_id: 'at0001', action_archetype_id: 'openEHR-EHR-ACTION\\.medication\\.v1', description: tree([element('Medication item', coded('Metformin 1000 mg tablet', 'ATC', 'A10BA02')), element('Route', text('Oral')), element('Overall directions description', text('1 tablet twice daily with meals'))]) }],
      },
      {
        _type: 'ACTION', name: text('Procedure'), archetype_node_id: 'openEHR-EHR-ACTION.procedure.v1', subject: { _type: 'PARTY_SELF' }, time: dateTime(TIME),
        ism_transition: { current_state: coded('completed', 'openehr', '532') },
        description: tree([element('Procedure name', text('Diabetic foot examination')), element('Description', text('Sensation and pulses normal in both feet.'))]),
      },
    ]),
    evaluation('Clinical synopsis', 'clinical_synopsis.v1', [element('Synopsis', text('Glucose control has slipped since spring. Agreed to raise metformin and review in three months.'))]),
  ],
};

writeFileSync(new URL('../src/samples/diabetes-review.openehr.json', import.meta.url), `${JSON.stringify(composition, null, 2)}\n`);
