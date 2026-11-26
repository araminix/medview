import { zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { Engine } from '@/engine/engine';
import { parseBytes, parseDicom } from '@/parsers';
import { personName } from '@/parsers/dicom/parseDicom';
import { readDicom } from '@/parsers/dicom/reader';
import { buildDicomSample, encodeDicom, type DicomItem } from '@/samples/dicomSample';
import { DEFAULT_SCRUB_OPTIONS } from '@/scrubber';
import { scrubDicom } from '@/scrubber/dicom';

const sampleBytes = buildDicomSample();
const SIZE = 192;
const shade = (rgba: Uint8ClampedArray, x: number, y: number, width = SIZE) => rgba[(y * width + x) * 4];

/** A small greyscale picture: 4 × 4, one byte a pixel, counting up from 0 in steps of 16. */
const ramp = Uint8Array.from({ length: 16 }, (_, i) => i * 16);
function tiny(extra: DicomItem = [], pixels: DicomItem[number][2] = ramp, bits = 8): DicomItem {
  const elements: DicomItem = [
    ['0008,0060', 'CS', 'OT'],
    ['0010,0010', 'PN', 'Rossi^Elena'],
    ['0010,0020', 'LO', 'P-778'],
    ['0020,000E', 'UI', '2.25.1'],
    ['0028,0002', 'US', 1],
    ['0028,0004', 'CS', 'MONOCHROME2'],
    ['0028,0010', 'US', 4],
    ['0028,0011', 'US', 4],
    ['0028,0100', 'US', bits],
    ['0028,0101', 'US', bits],
    ['0028,0103', 'US', 0],
    ['7FE0,0010', bits === 8 ? 'OB' : 'OW', pixels],
  ];
  return [...elements, ...extra].sort(([a], [b]) => a.localeCompare(b));
}

describe('DICOM sample file', () => {
  const { document } = parseBytes(sampleBytes.slice());
  const { record } = document;

  test('is recognized, with the patient and the study', () => {
    expect(record.meta).toMatchObject({ format: 'dicom', syntax: 'dicom', summary: 'DICOM · CT · 8 images' });
    expect(record.patient).toMatchObject({ name: 'Daniel Okonkwo', dob: '1979-05-12', sex: 'male' });
    expect(record.patient.identifiers).toEqual([{ label: 'Patient ID', value: 'MV-2025-0931' }, { label: 'Accession', value: 'ACC-7731902' }]);
    expect(record.encounters[0]).toMatchObject({ kind: 'Imaging study', title: 'CT chest without contrast', start: '2025-09-18T10:45', location: 'Lakeside Imaging Center', provider: 'Dr. Leila Haddad' });
    expect(record.procedures[0]).toMatchObject({ name: 'CT scan — chest', bodySystem: 'respiratory' });
  });

  test('describes its pictures for the viewer', () => {
    expect(record.imaging).toMatchObject({ frames: 8, width: SIZE, height: SIZE, greyscale: true, unavailable: undefined });
    expect(record.imaging!.details).toContainEqual({ label: 'Modality', value: 'CT scan (CT)' });
    expect(record.imaging!.details).toContainEqual({ label: 'Stored as', value: 'Explicit VR Little Endian' });
  });

  test('draws a frame through the rescale and the brightness window of the file', () => {
    const frame = document.renderFrame!(0)!;
    expect(frame).toMatchObject({ width: SIZE, height: SIZE, window: { center: -300, width: 1500 } });
    expect(frame.rgba).toHaveLength(SIZE * SIZE * 4);
    const [air, lung, tissue, bone] = [shade(frame.rgba!, 2, 2), shade(frame.rgba!, 58, 96), shade(frame.rgba!, 96, 60), shade(frame.rgba!, 90, 142)];
    expect(air).toBeLessThan(10);
    expect(lung).toBeLessThan(tissue);
    expect(tissue).toBeLessThan(bone);
    expect(bone).toBe(255);
  });

  test('a narrower window makes the same tissue brighter, and frames differ from one another', () => {
    const wide = document.renderFrame!(0)!;
    const narrow = document.renderFrame!(0, { window: { center: -800, width: 400 } })!;
    expect(shade(narrow.rgba!, 58, 96)).toBeGreaterThan(shade(wide.rgba!, 58, 96));
    expect(document.renderFrame!(7)!.rgba).not.toEqual(wide.rgba);
    const brighter = document.renderFrame!(0, { adjustment: { brightness: 40, contrast: 0 } })!;
    expect(brighter.window).toEqual({ center: -900, width: 1500 });
    expect(shade(brighter.rgba!, 58, 96)).toBeGreaterThan(shade(wide.rgba!, 58, 96));
    expect(document.renderFrame!(0, { adjustment: { brightness: 0, contrast: 50 } })!.window).toEqual({ center: -300, width: 750 });
    expect(document.renderFrame!(8)).toBeUndefined();
  });

  test('lists every attribute for the inspector, grouped', () => {
    expect(record.sources.map((s) => s.id)).toEqual(['file', 'study', 'patient', 'acquisition', 'image']);
    expect(document.getSource('patient')).toContain('(0010,0010) PN PatientName: Okonkwo^Daniel');
    expect(document.getSource('image')).toContain('(0028,0010) US Rows: 192');
  });
});

describe('DICOM encodings', () => {
  const expected = Array.from(ramp);
  const greys = (bytes: Uint8Array) => {
    const frame = parseDicom([{ name: 'a.dcm', bytes }]).renderFrame!(0, { window: { center: 127.5, width: 255 } })!;
    return Array.from({ length: 16 }, (_, i) => frame.rgba![i * 4]);
  };

  test('implicit VR little endian', () => {
    const bytes = encodeDicom(tiny(), '1.2.840.10008.1.2');
    expect(parseDicom([{ name: 'a.dcm', bytes }]).record.patient.name).toBe('Elena Rossi');
    expect(greys(bytes)).toEqual(expected);
  });

  test('explicit VR big endian, sixteen bits a pixel', () => {
    const words = (littleEndian: boolean) => {
      const bytes = new Uint8Array(32);
      ramp.forEach((value, i) => new DataView(bytes.buffer).setUint16(i * 2, value, littleEndian));
      return bytes;
    };
    expect(greys(encodeDicom(tiny([], words(false), 16), '1.2.840.10008.1.2.2'))).toEqual(expected);
    expect(greys(encodeDicom(tiny([], words(true), 16)))).toEqual(expected);
  });

  test('RLE lossless', () => {
    // One segment of literal bytes: a count of n - 1, then the n bytes.
    const segment = Uint8Array.of(15, ...ramp);
    const header = new Uint8Array(64);
    new DataView(header.buffer).setUint32(0, 1, true);
    new DataView(header.buffer).setUint32(4, 64, true);
    const fragment = new Uint8Array([...header, ...segment, 0]);
    expect(greys(encodeDicom(tiny([], { fragments: [fragment] }), '1.2.840.10008.1.2.5'))).toEqual(expected);
  });

  test('colour, pixel by pixel and plane by plane', () => {
    const colour = (planar: number, pixels: Uint8Array): DicomItem =>
      tiny([['0028,0006', 'US', planar]], pixels).map((e) => (e[0] === '0028,0002' ? [e[0], e[1], 3] : e[0] === '0028,0004' ? [e[0], e[1], 'RGB'] : e[0] === '0028,0010' || e[0] === '0028,0011' ? [e[0], e[1], 1] : e)) as DicomItem;
    const first = (bytes: Uint8Array) => Array.from(parseDicom([{ name: 'a.dcm', bytes }]).renderFrame!(0)!.rgba!.slice(0, 4));
    expect(first(encodeDicom(colour(0, Uint8Array.of(200, 100, 50, 0))))).toEqual([200, 100, 50, 255]);
    expect(first(encodeDicom(colour(1, Uint8Array.of(200, 100, 50, 0))))).toEqual([200, 100, 50, 255]);
  });

  test('JPEG baseline is handed to the browser as it is stored', () => {
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9, 0);
    const parsed = parseDicom([{ name: 'a.dcm', bytes: encodeDicom(tiny([], { fragments: [jpeg] }), '1.2.840.10008.1.2.4.50') }]);
    expect(parsed.record.imaging).toMatchObject({ frames: 1, greyscale: false });
    expect(Array.from(parsed.renderFrame!(0)!.jpeg!)).toEqual(Array.from(jpeg));
  });

  test('a compression MedView cannot decode still shows the details', () => {
    const { record } = parseDicom([{ name: 'a.dcm', bytes: encodeDicom(tiny([], { fragments: [Uint8Array.of(1, 2)] }), '1.2.840.10008.1.2.4.90') }]);
    expect(record.imaging).toMatchObject({ frames: 0, unavailable: 'The picture is stored as JPEG 2000 Lossless, which MedView cannot decode yet.' });
    expect(record.patient.name).toBe('Elena Rossi');
    expect(record.meta.summary).toBe('DICOM · OT · 0 images');
  });

  test('sequences are read through, and what follows them is still found', () => {
    const nested: DicomItem = [['0008,1115', 'SQ', [[['0008,0090', 'PN', 'Marino^Paolo'], ['0010,0010', 'PN', 'Rossi^Elena']], [['0008,0050', 'SH', 'INNER-1']]]]];
    for (const syntax of ['1.2.840.10008.1.2.1', '1.2.840.10008.1.2']) {
      const file = readDicom(encodeDicom(tiny(nested), syntax));
      expect(file.elements.filter((e) => e.depth === 1).map((e) => e.tag)).toEqual(['0008,0090', '0010,0010', '0008,0050']);
      expect(file.elements.at(-1)).toMatchObject({ tag: '7FE0,0010', depth: 0, length: 16 });
    }
  });

  test('a file cut off in the middle is reported, not fatal', () => {
    const { record } = parseDicom([{ name: 'a.dcm', bytes: sampleBytes.slice(0, 5000) }]);
    expect(record.patient.name).toBe('Daniel Okonkwo');
    expect(record.imaging!.frames).toBe(0);
    expect(record.meta.warnings.map((w) => w.message)).toContain('The file is cut off before the end of the picture.');
  });

  test('person names are written the way people write them', () => {
    expect(personName('Haddad^Leila^^Dr.')).toBe('Dr. Leila Haddad');
    expect(personName('Yamada^Tarou=山田^太郎')).toBe('Tarou Yamada');
    expect(personName('')).toBeUndefined();
  });
});

describe('DICOM anonymizer', () => {
  const nested: DicomItem = [['0008,1115', 'SQ', [[['0010,0010', 'PN', 'Okonkwo^Daniel']]]]];
  const original = encodeDicom([...readable(), ...nested].sort(([a], [b]) => a.localeCompare(b)));

  function readable(): DicomItem {
    return tiny([['0008,0080', 'LO', 'Lakeside Imaging Center'], ['0008,0090', 'PN', 'Haddad^Leila'], ['0010,0030', 'DA', '19790512'], ['0010,2154', 'SH', '+1 555 0100']]).map((e) => (e[0] === '0010,0010' ? [e[0], e[1], 'Okonkwo^Daniel'] : e)) as DicomItem;
  }

  test('overwrites private values in place and leaves the picture alone', () => {
    const changes = new Map();
    const scrubbed = scrubDicom(original, DEFAULT_SCRUB_OPTIONS, changes);
    expect(scrubbed).toHaveLength(original.length);
    const text = new TextDecoder('latin1').decode(scrubbed);
    for (const secret of ['Okonkwo', 'Daniel', 'Lakeside', 'Haddad', '19790512', '555 0100', 'P-778']) expect(text).not.toContain(secret);
    const parsed = parseDicom([{ name: 'a.dcm', bytes: scrubbed }]);
    expect(parsed.record.patient).toMatchObject({ name: 'ANONYMOUS', dob: '1979-01-01' });
    expect(parsed.renderFrame!(0)!.rgba).toEqual(parseDicom([{ name: 'a.dcm', bytes: original }]).renderFrame!(0)!.rgba);
    expect(changes.get('name:Okonkwo^Daniel')).toMatchObject({ replacement: 'ANONYMOUS', count: 2 });
  });

  test('changes only what is asked for', () => {
    const scrubbed = scrubDicom(original, { ...DEFAULT_SCRUB_OPTIONS, names: false, providers: false });
    const text = new TextDecoder('latin1').decode(scrubbed);
    expect(text).toContain('Okonkwo^Daniel');
    expect(text).toContain('Lakeside Imaging Center');
    expect(text).not.toContain('19790512');
  });
});

describe('DICOM in the engine', () => {
  const slice = (instance: number, level: number) => encodeDicom(tiny([['0020,0013', 'IS', String(instance)]], new Uint8Array(16).fill(level)));

  test('a zip of slices becomes one series in scanner order', () => {
    const zip = zipSync({ 'study/IM3': slice(3, 30), 'study/IM1': slice(1, 10), 'study/IM2': slice(2, 20), 'study/README.txt': new Uint8Array(200), 'DICOMDIR': new Uint8Array(400) });
    const engine = new Engine();
    const { record } = engine.load(zip);
    expect(record.meta.summary).toBe('DICOM · OT · 3 images');
    expect(record.meta.warnings[0].message).toBe('Opened 3 DICOM images from the archive');
    const levels = [0, 1, 2].map((i) => engine.imageFrame(i, { window: { center: 127.5, width: 255 } })!.rgba![0]);
    expect(levels).toEqual([10, 20, 30]);
    expect(engine.scrubbedFile(DEFAULT_SCRUB_OPTIONS).kind).toBe('zip');
  });

  test('scrubbing shows the anonymized file and can be undone', () => {
    const engine = new Engine();
    expect(engine.load(sampleBytes.slice()).record.patient.name).toBe('Daniel Okonkwo');
    expect(engine.previewScrub(DEFAULT_SCRUB_OPTIONS).map((c) => c.category).sort()).toEqual(['birthDate', 'id', 'id', 'name', 'provider', 'provider']);
    const scrubbed = engine.applyScrub(DEFAULT_SCRUB_OPTIONS);
    expect(scrubbed).toMatchObject({ scrubbed: true, record: { patient: { name: 'ANONYMOUS' } } });
    expect(engine.imageFrame(0)!.width).toBe(SIZE);
    expect(engine.rawText(100000).text).not.toContain('Okonkwo');
    const file = engine.scrubbedFile(DEFAULT_SCRUB_OPTIONS);
    expect(file.kind).toBe('dicom');
    expect(file.content).toHaveLength(sampleBytes.length);
    expect(engine.revertScrub().record.patient.name).toBe('Daniel Okonkwo');
  });
});
