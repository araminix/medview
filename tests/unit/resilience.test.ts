import { describe, expect, test } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseBytes, parseText, UnreadableFileError } from '@/parsers';
import { detectSyntax } from '@/parsers/detect';
import { recordOf, sample, warningsOf } from './helpers';

const encode = (text: string) => new TextEncoder().encode(text);

function failure(run: () => unknown): UnreadableFileError {
  try {
    run();
  } catch (error) {
    if (error instanceof UnreadableFileError) return error;
    throw error;
  }
  throw new Error('Expected an UnreadableFileError');
}

describe('broken and malformed files', () => {
  test('truncated JSON gives a friendly error with a line hint', () => {
    const error = failure(() => parseText(sample('complex-care.fhir.json').slice(0, 5000)));
    expect(error.message).toBe('This JSON file is damaged or incomplete');
  });

  test('invalid XML gives a friendly error', () => {
    const error = failure(() => parseText('<ClinicalDocument xmlns="urn:hl7-org:v3"><recordTarget><patientRole></recordTarget>'));
    expect(error.message).toBe('This XML file is damaged or incomplete');
  });

  test('JSON that is not FHIR is explained', () => {
    expect(failure(() => parseText('{"hello":"world"}')).message).toBe('This JSON file is not a FHIR resource');
  });

  test('messy bundle renders valid data and collects warnings', () => {
    const messy = JSON.stringify({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'p', birthDate: '2025-99-99' } },
        { resource: { resourceType: 'Observation', id: 'o1', code: { text: 'HIV 1+2 Ab' }, subject: { reference: 'Patient/p' }, valueString: 'Positive', effectiveDateTime: '2025-13-40' } },
        { resource: { resourceType: 'Observation', id: 'o2', code: { text: 'Troponin' }, subject: { reference: 'Patient/p' }, encounter: { reference: 'Encounter/missing' }, valueString: '<0.01' } },
        { resource: { resourceType: 'Observation', id: 'o3', code: { text: 'Empty result' }, subject: { reference: 'Patient/p' } } },
        { resource: { resourceType: 'Condition', id: 'c', code: 'not-a-concept', subject: { reference: 'Patient/p' } } },
        { resource: 'not an object' },
        { resource: { resourceType: 'Observation', id: 'o4', code: { text: 'Sodium' }, valueQuantity: { value: 140, unit: 'mmol/L' }, referenceRange: 'garbage' } },
      ],
    });
    const record = recordOf(messy);
    expect(record.labs.map((l) => l.valueText)).toEqual(['Positive', '<0.01', '140']);
    expect(record.labs[1].value).toBe(0.01);
    expect(record.conditions).toHaveLength(1);
    expect(warningsOf(messy)).toEqual([
      'Patient has no name',
      'Invalid date "2025-99-99"',
      'Invalid date "2025-13-40"',
      'Observation "Empty result" has no value',
      'Unresolved reference: Encounter/missing',
    ]);
  });

  test('C-CDA with a missing name and invalid birth date still parses', () => {
    const xml = '<ClinicalDocument xmlns="urn:hl7-org:v3"><recordTarget><patientRole><patient><birthTime value="20259999"/></patient></patientRole></recordTarget></ClinicalDocument>';
    expect(warningsOf(xml)).toEqual(['Patient has no name', 'Invalid birth date "20259999"', 'Document has no structured sections']);
  });
});

describe('encodings and international text', () => {
  const patient = (name: string) => JSON.stringify({ resourceType: 'Patient', name: [{ text: name }] });

  test.each(['Jürgen Weiß-Böhm', 'Françoise Lefèvre-Dégas', 'محمدرضا شجریان', 'فاطمة الزهراء', '山田 太郎'])('keeps %s intact', (name) => {
    expect(parseBytes(encode(patient(name))).document.record.patient.name).toBe(name);
  });

  test('strips a UTF-8 byte-order mark from XML', () => {
    const xml = String.fromCharCode(0xfeff) + '<?xml version="1.0" encoding="UTF-8"?><Patient xmlns="http://hl7.org/fhir"><name><text value="Þórdís Ægisdóttir"/></name></Patient>';
    expect(parseBytes(encode(xml)).document.record.patient.name).toBe('Þórdís Ægisdóttir');
  });

  test('decodes UTF-16 with a BOM', () => {
    const text = patient('Zoë Müller');
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i += 1) {
      bytes[2 + i * 2] = text.charCodeAt(i) & 0xff;
      bytes[3 + i * 2] = text.charCodeAt(i) >> 8;
    }
    expect(parseBytes(bytes).document.record.patient.name).toBe('Zoë Müller');
  });

  test('honours an ISO-8859-1 XML declaration', () => {
    const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><Patient xmlns="http://hl7.org/fhir"><name><text value="Jörg"/></name></Patient>';
    const bytes = Uint8Array.from(xml, (ch) => ch.charCodeAt(0));
    expect(parseBytes(bytes).document.record.patient.name).toBe('Jörg');
  });

  test('HL7 with umlauts', () => {
    expect(recordOf('MSH|^~\\&|A|B|||20250101||ADT^A01|1|P|2.5\rPID|1||1^^^^MR||Größmann^Käthe').patient.name).toBe('Käthe Größmann');
  });
});

describe('auto-detection', () => {
  test('identifies formats from content alone', () => {
    expect(detectSyntax('  \n{"resourceType":"Bundle"}')).toBe('json');
    expect(detectSyntax('<?xml version="1.0"?><ClinicalDocument/>')).toBe('xml');
    expect(detectSyntax('MSH|^~\\&|LAB')).toBe('hl7');
    expect(detectSyntax('PID|1||123')).toBe('hl7');
    expect(detectSyntax('Dear doctor, please find attached')).toBe('unknown');
  });

  test.each([
    ['complex-care.fhir.json', 'fhir-r4'],
    ['messy-lab.hl7', 'hl7-v2'],
    ['discharge-summary.ccda.xml', 'ccda'],
  ])('%s pasted as plain text is recognized as %s', (name, format) => {
    expect(recordOf(`\n\n${sample(name)}`).meta.format).toBe(format);
  });

  test('rejects executables, videos and other binaries with a clear message', () => {
    const exe = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const mp4 = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
    const noise = Uint8Array.from({ length: 512 }, (_, i) => (i * 7) % 9);
    expect(failure(() => parseBytes(exe)).message).toBe('This looks like a Windows program, not a medical record file');
    expect(failure(() => parseBytes(mp4)).message).toBe('This looks like a video file, not a medical record file');
    expect(failure(() => parseBytes(noise)).message).toBe('This file is not readable text');
    expect(failure(() => parseBytes(new Uint8Array())).message).toBe('This file is empty');
    expect(failure(() => parseText('just some notes')).message).toBe('This file format is not recognized');
  });

  test('flags formats planned for later versions', () => {
    const dicom = new Uint8Array(140);
    dicom.set([0x44, 0x49, 0x43, 0x4d], 128);
    expect(failure(() => parseBytes(dicom)).message).toBe('DICOM images are not supported yet');
    expect(parseText('<HealthData locale="en_US"></HealthData>').record.meta.format).toBe('apple-health');
  });

  test('opens the record inside a zip archive', () => {
    const zip = zipSync({ 'export/patient.json': strToU8(JSON.stringify({ resourceType: 'Patient', name: [{ text: 'Zipped Patient' }] })), 'readme.md': strToU8('hi') });
    const { document } = parseBytes(zip);
    expect(document.record.patient.name).toBe('Zipped Patient');
    expect(document.record.meta.warnings[0]).toMatchObject({ severity: 'info', message: 'Opened "export/patient.json" from the archive' });
  });
});
