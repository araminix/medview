import { describe, expect, test } from 'vitest';
import { parseText } from '@/parsers';
import { parseXml } from '@/parsers/shared/xml';
import { tokenize } from '@/parsers/hl7v2/tokenizer';
import { DEFAULT_SCRUB_OPTIONS, scrubText } from '@/scrubber';
import { syntheticId } from '@/scrubber/dictionary';
import { sample } from './helpers';

const ALL = DEFAULT_SCRUB_OPTIONS;

/** Every private string in each sample, including pieces that only occur in narrative or notes. */
const PHI: Record<string, string[]> = {
  'complex-care.fhir.json': [
    'Marcus', 'Delgado', 'Renata', '1968-08-14', '14 Aug 1968', 'MRN-48213907', '000-12-3456', '(555) 014-2290', '(555) 014-7781',
    'marcus.delgado@example.org', '2417 Alder Creek Road', 'Portland', '97205', 'Okafor', 'Ngozi', 'Riverside Community Hospital',
  ],
  'messy-lab.hl7': [
    'Hartmann', 'Greta', 'Jonas', '19590223', 'NG-7730155', '000-45-6789', 'ACC-55120', '88 Linden Court', 'Apt 4B', 'Madison', '53703',
    '(555) 013-4471', '(555) 013-9902', '(555) 013-4480', '(555) 013-2200', 'Brandt', 'Emil', 'NORTHGATE', 'V20250411-0092',
  ],
  'discharge-summary.ccda.xml': [
    'Eleanor', 'Whitfield', '19570309', 'LGH-00391827', '000-78-9012', '1420 Harbor View Drive', 'Duluth', '55802', '(555)010-7742',
    'eleanor.whitfield@example.org', 'Achterberg', 'Samuel', 'Lakeshore General Hospital', '1548273960', '(555) 010-3300',
  ],
};

describe.each(Object.keys(PHI))('scrubbing %s', (name) => {
  const original = sample(name);
  const { text, changes } = scrubText(original, ALL);

  test('leaves zero occurrences of any private string', () => {
    const leaked = PHI[name].filter((secret) => text.toLowerCase().includes(secret.toLowerCase()));
    expect(leaked).toEqual([]);
    expect(PHI[name].every((secret) => original.toLowerCase().includes(secret.toLowerCase()))).toBe(true);
  });

  test('reports what was replaced', () => {
    expect(changes.length).toBeGreaterThan(5);
    expect(changes.every((c) => c.count > 0 && !c.replacement.includes(c.original))).toBe(true);
  });

  test('preserves clinical content', () => {
    const before = parseText(original).record;
    const after = parseText(text).record;
    const clinical = (r: typeof before) => ({
      labs: r.labs.map((l) => [l.name, l.valueText, l.unit, l.refLow, l.refHigh, l.flag, l.date]),
      vitals: r.vitals.map((l) => [l.name, l.valueText, l.unit]),
      medications: r.medications.map((m) => [m.name, m.dosage, m.status]),
      conditions: r.conditions.map((c) => [c.name, c.codes, c.status]),
      allergies: r.allergies.map((a) => [a.substance, a.reaction]),
      nodes: r.graph.nodes.length,
      edges: r.graph.edges.length,
    });
    expect(clinical(after)).toEqual(clinical(before));
    // Only the year survives, so the age may shift by the months dropped — never by more than a year.
    expect(Math.abs(after.patient.age! - before.patient.age!)).toBeLessThanOrEqual(1);
    expect(after.patient.dob).toBe(before.patient.dob!.slice(0, 4));
    // A bare middle initial is kept: replacing single letters across a file would damage clinical text.
    expect(after.patient.name).toMatch(/^Patient (\w\.? )?Alpha$/);
    expect(after.meta.warnings.map((w) => w.message)).toEqual(before.meta.warnings.map((w) => w.message));
  });
});

describe('format preservation', () => {
  test('scrubbed FHIR stays valid JSON with the same structure', () => {
    const original = JSON.parse(sample('complex-care.fhir.json'));
    const scrubbed = JSON.parse(scrubText(sample('complex-care.fhir.json'), ALL).text);
    expect(scrubbed.entry).toHaveLength(original.entry.length);
    expect(scrubbed.entry[0].resource.birthDate).toBe('1968');
    expect(scrubbed.entry[0].resource.identifier[0].value).toBe(syntheticId('MRN-48213907'));
    expect(scrubbed.entry[0].resource.address[0]).toMatchObject({ city: '[REDACTED]', state: 'OR' });
    expect(scrubbed.entry[0].resource.text.div).toContain('Patient');
  });

  test('scrubbed HL7 keeps segments and pipe delimiters', () => {
    const before = tokenize(sample('messy-lab.hl7'));
    const after = tokenize(scrubText(sample('messy-lab.hl7'), ALL).text);
    expect(after.map((s) => [s.name, s.fields.length])).toEqual(before.map((s) => [s.name, s.fields.length]));
    expect(after.find((s) => s.name === 'PID')!.fields[5]).toBe('Alpha^Patient^L');
    expect(after.find((s) => s.name === 'PID')!.fields[7]).toBe('1959');
    expect(after.find((s) => s.name === 'NTE')!.fields[3]).toContain('Dr. ');
  });

  test('scrubbed C-CDA stays well-formed XML', () => {
    const document = parseXml(scrubText(sample('discharge-summary.ccda.xml'), ALL).text);
    expect(document.documentElement!.localName).toBe('ClinicalDocument');
  });
});

describe('options', () => {
  const fhir = sample('complex-care.fhir.json');

  test('provider masking can be turned off', () => {
    const { text } = scrubText(fhir, { ...ALL, providers: false });
    expect(text).toContain('Okafor');
    expect(text).toContain('Riverside Community Hospital');
    expect(text).not.toContain('Delgado');
  });

  test('each category is independent', () => {
    const { text } = scrubText(fhir, { names: false, birthDate: true, ids: false, contacts: false, providers: false });
    expect(text).toContain('Delgado');
    expect(text).toContain('MRN-48213907');
    expect(text).toContain('(555) 014-2290');
    expect(text).not.toContain('1968-08-14');
  });

  test('nothing selected changes nothing', () => {
    const none = { names: false, birthDate: false, ids: false, contacts: false, providers: false };
    expect(scrubText(fhir, none)).toEqual({ text: fhir, changes: [] });
  });
});

test('scrubs FHIR XML, including the narrative div', () => {
  const xml = `<Patient xmlns="http://hl7.org/fhir"><text><div xmlns="http://www.w3.org/1999/xhtml">Zoë Lefèvre, born 30 November 1975</div></text>
    <identifier><value value="ZL-99"/></identifier><name><family value="Lefèvre"/><given value="Zoë"/></name><birthDate value="1975-11-30"/></Patient>`;
  const { text } = scrubText(xml, ALL);
  expect(text).not.toMatch(/Zoë|Lefèvre|1975-11-30|30 November|ZL-99/);
  expect(parseText(text).record.patient).toMatchObject({ name: 'Patient Alpha', dob: '1975' });
});
