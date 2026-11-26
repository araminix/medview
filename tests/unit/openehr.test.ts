import { describe, expect, test } from 'vitest';
import { parseText } from '@/parsers';
import { scrubText, DEFAULT_SCRUB_OPTIONS } from '@/scrubber';
import { recordOf, sample } from './helpers';

const json = sample('diabetes-review.openehr.json');

describe('openEHR composition (canonical JSON)', () => {
  const record = recordOf(json);

  test('is recognized, with the visit taken from its context', () => {
    expect(record.meta).toMatchObject({ format: 'openehr', syntax: 'json', summary: 'openEHR · 12 entries' });
    expect(record.encounters[0]).toMatchObject({ title: 'Diabetes review', location: 'Vårdcentralen Södermalm', provider: 'Dr. Ingrid Bergström', start: expect.stringMatching(/^2025-10-14/) });
    expect(record.patient.name).toBeUndefined();
    expect(record.meta.warnings[0]).toMatchObject({ severity: 'info' });
  });

  test('reads vital signs, naming each by its entry', () => {
    const vitals = Object.fromEntries(record.vitals.map((v) => [v.name, `${v.valueText} ${v.unit ?? ''}`.trim()]));
    expect(vitals).toEqual({ 'Blood pressure': '152/96 mm[Hg]', Pulse: '88 /min', 'Body temperature': '37.2 Cel', 'Body weight': '94.5 kg', 'Pulse oximetry': '97 %' });
  });

  test('reads laboratory analytes with their ranges and flags', () => {
    expect(record.labs.map((l) => l.name)).toEqual(['Hemoglobin A1c', 'Creatinine', 'LDL cholesterol']);
    expect(record.labs[0]).toMatchObject({ value: 61, unit: 'mmol/mol', refLow: 27, refHigh: 42, flag: 'high', panel: 'Diabetes', codes: [{ code: '4548-4', system: 'LOINC', display: 'Hemoglobin A1c' }] });
    expect(record.labs[1].flag).toBe('normal');
  });

  test('reads problems, allergies, medication and procedures', () => {
    expect(record.conditions.map((c) => `${c.name} (${c.onset})`)).toEqual(['Type 2 diabetes mellitus (2019-03-01)', 'Essential hypertension (2021-06-15)']);
    expect(record.allergies[0]).toMatchObject({ substance: 'Amoxicillin', reaction: 'Skin rash', severity: 'Low' });
    expect(record.medications[0]).toMatchObject({ name: 'Metformin 1000 mg tablet', route: 'Oral', dosage: '1 tablet twice daily with meals', status: 'active' });
    expect(record.procedures[0]).toMatchObject({ name: 'Diabetic foot examination', status: 'completed' });
    expect(record.documents.find((d) => d.title === 'Clinical synopsis')?.text).toContain('Glucose control has slipped');
  });

  test('links every entry to the composition in the graph', () => {
    expect(record.graph.nodes).toHaveLength(15);
    expect(record.graph.edges.filter((e) => e.source === 'composition')).toHaveLength(15 - 1);
  });

  test('scrubbing hides the clinician, the facility and their identifiers, and keeps the file valid', () => {
    const { text } = scrubText(json, DEFAULT_SCRUB_OPTIONS);
    for (const secret of ['Bergström', 'Ingrid', 'Södermalm', 'SE-HSA-771204', 'SE2321000016-1HZ3']) expect(text).not.toContain(secret);
    const scrubbed = recordOf(text);
    expect(scrubbed.labs).toHaveLength(3);
    expect(scrubbed.conditions[0].name).toBe('Type 2 diabetes mellitus');
  });
});

describe('openEHR composition (canonical XML)', () => {
  const xml = `<?xml version="1.0"?>
<composition xmlns="http://schemas.openehr.org/v1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" archetype_node_id="openEHR-EHR-COMPOSITION.encounter.v1">
  <name><value>Check-up</value></name>
  <composer xsi:type="PARTY_IDENTIFIED"><name>Dr. Lars Holm</name></composer>
  <context><start_time><value>2025-05-02T08:00:00Z</value></start_time></context>
  <content xsi:type="OBSERVATION" archetype_node_id="openEHR-EHR-OBSERVATION.body_weight.v2">
    <name><value>Body weight</value></name>
    <data archetype_node_id="at0002"><name><value>history</value></name><origin><value>2025-05-02T08:10:00Z</value></origin>
      <events xsi:type="POINT_EVENT" archetype_node_id="at0003"><name><value>Any event</value></name><time><value>2025-05-02T08:10:00Z</value></time>
        <data xsi:type="ITEM_TREE" archetype_node_id="at0001"><name><value>Simple</value></name>
          <items xsi:type="ELEMENT" archetype_node_id="at0004"><name><value>Weight</value></name><value xsi:type="DV_QUANTITY"><magnitude>81.4</magnitude><units>kg</units></value></items>
        </data>
      </events>
    </data>
  </content>
  <content xsi:type="EVALUATION" archetype_node_id="openEHR-EHR-EVALUATION.problem_diagnosis.v1">
    <name><value>Problem/Diagnosis</value></name>
    <data xsi:type="ITEM_TREE" archetype_node_id="at0001"><name><value>structure</value></name>
      <items xsi:type="ELEMENT" archetype_node_id="at0002"><name><value>Problem/Diagnosis name</value></name><value xsi:type="DV_TEXT"><value>Asthma</value></value></items>
    </data>
  </content>
</composition>`;
  const document = parseText(xml);

  test('reads the same structure from XML', () => {
    const { record } = document;
    expect(record.meta).toMatchObject({ format: 'openehr', syntax: 'xml', summary: 'openEHR · 2 entries' });
    expect(record.vitals[0]).toMatchObject({ name: 'Body weight', value: 81.4, unit: 'kg', date: expect.stringMatching(/^2025-05-02/) });
    expect(record.conditions[0].name).toBe('Asthma');
    expect(document.getSource('observation-1')).toContain('<magnitude>81.4</magnitude>');
  });
});

describe('openEHR files MedView cannot read', () => {
  const message = (text: string) => {
    try {
      parseText(text);
      return '';
    } catch (error) {
      return (error as Error).message;
    }
  };
  test('the flat format is named as such', () => {
    expect(message('{"ctx/language":"en","vitals/body_weight:0/any_event:0/weight|magnitude":80}')).toBe('This openEHR file is in the flat format');
  });
  test('a single entry is not a composition', () => {
    expect(message('{"_type":"OBSERVATION","archetype_node_id":"openEHR-EHR-OBSERVATION.pulse.v2"}')).toBe('This openEHR file is not a composition');
  });
});
