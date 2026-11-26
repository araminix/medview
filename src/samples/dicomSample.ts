/**
 * Builds the synthetic DICOM sample in memory: a drawn "phantom" of a chest, not a scan of anyone.
 * Also the small DICOM writer the tests use to make files in other encodings.
 */

/** Compressed pixel data: an empty offset table, then one fragment per entry. */
export interface Fragments {
  fragments: Uint8Array[];
}

export type DicomValue = string | number | Uint8Array | DicomItem[] | Fragments;
export type DicomItem = Array<[tag: string, vr: string, value: DicomValue]>;

interface Encoding {
  explicit?: boolean;
  littleEndian?: boolean;
}

const LONG_VR = new Set(['OB', 'OW', 'SQ', 'UN', 'UT']);
const UNDEFINED = 0xffffffff;

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    output.set(part, at);
    at += part.length;
  }
  return output;
}

function valueBytes(vr: string, value: DicomValue, encoding: Required<Encoding>): Uint8Array {
  if (value instanceof Uint8Array) return value.length % 2 ? concat([value, new Uint8Array(1)]) : value;
  if (typeof value === 'object' && 'fragments' in value) {
    const item = (bytes: Uint8Array) => [tagBytes('FFFE,E000', encoding), u32(bytes.length, encoding), bytes];
    return concat([...item(new Uint8Array(0)), ...value.fragments.flatMap(item), tagBytes('FFFE,E0DD', encoding), u32(0, encoding)]);
  }
  if (Array.isArray(value)) {
    // Items of undefined length, closed by delimiters: the layout scanners most often write.
    return concat([...value.flatMap((item) => [tagBytes('FFFE,E000', encoding), u32(UNDEFINED, encoding), encodeElements(item, encoding), tagBytes('FFFE,E00D', encoding), u32(0, encoding)]), tagBytes('FFFE,E0DD', encoding), u32(0, encoding)]);
  }
  if (typeof value === 'number') {
    const bytes = new Uint8Array(vr === 'UL' ? 4 : 2);
    const view = new DataView(bytes.buffer);
    if (vr === 'UL') view.setUint32(0, value, encoding.littleEndian);
    else view.setUint16(0, value, encoding.littleEndian);
    return bytes;
  }
  const text = value.length % 2 ? `${value}${vr === 'UI' ? '\0' : ' '}` : value;
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

function tagBytes(tag: string, encoding: Required<Encoding>): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, parseInt(tag.slice(0, 4), 16), encoding.littleEndian);
  view.setUint16(2, parseInt(tag.slice(5), 16), encoding.littleEndian);
  return bytes;
}

function u32(value: number, encoding: Required<Encoding>): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, encoding.littleEndian);
  return bytes;
}

function encodeElements(elements: DicomItem, encoding: Required<Encoding>): Uint8Array {
  return concat(
    elements.flatMap(([tag, vr, value]) => {
      const body = valueBytes(vr, value, encoding);
      const length = Array.isArray(value) || (typeof value === 'object' && 'fragments' in value) ? UNDEFINED : body.length;
      if (!encoding.explicit) return [tagBytes(tag, encoding), u32(length, encoding), body];
      const code = Uint8Array.from(vr, (character) => character.charCodeAt(0));
      if (LONG_VR.has(vr)) return [tagBytes(tag, encoding), code, new Uint8Array(2), u32(length, encoding), body];
      const short = new Uint8Array(2);
      new DataView(short.buffer).setUint16(0, length, encoding.littleEndian);
      return [tagBytes(tag, encoding), code, short, body];
    }),
  );
}

/** Writes a DICOM Part 10 file. `elements` must be in tag order; the transfer syntax decides the encoding of the data set. */
export function encodeDicom(elements: DicomItem, transferSyntax = '1.2.840.10008.1.2.1', body?: Uint8Array): Uint8Array {
  const meta: Required<Encoding> = { explicit: true, littleEndian: true };
  const metaElements = encodeElements(
    [
      ['0002,0001', 'OB', Uint8Array.of(0, 1)],
      ['0002,0002', 'UI', '1.2.840.10008.5.1.4.1.1.7'],
      ['0002,0003', 'UI', '2.25.329800735698586629295641978511506172918'],
      ['0002,0010', 'UI', transferSyntax],
      ['0002,0012', 'UI', '2.25.80302813137786398554742050926734630921'],
    ],
    meta,
  );
  const encoding = { explicit: transferSyntax !== '1.2.840.10008.1.2', littleEndian: transferSyntax !== '1.2.840.10008.1.2.2' };
  const preamble = new Uint8Array(132);
  preamble.set([0x44, 0x49, 0x43, 0x4d], 128);
  return concat([preamble, encodeElements([['0002,0000', 'UL', metaElements.length]], meta), metaElements, body ?? encodeElements(elements, encoding)]);
}

const SIZE = 192;
const FRAMES = 8;
const AIR = 0;
const WATER = 1024;

/** A drawn slice through a chest: body, two lungs, a heart and a spine. `t` moves through the stack of slices. */
function phantomSlice(t: number): Uint16Array {
  const pixels = new Uint16Array(SIZE * SIZE);
  const inside = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const lung = 0.75 + 0.25 * Math.sin(t * Math.PI);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let value = AIR;
      if (inside(x, y, 96, 100, 84, 62)) value = WATER - 100;
      if (inside(x, y, 96, 100, 78, 56)) value = WATER + 40;
      if (inside(x, y, 58, 96, 30 * lung, 40 * lung) || inside(x, y, 134, 96, 30 * lung, 40 * lung)) value = WATER - 820;
      if (inside(x, y, 104, 104, 22, 20 + 6 * t)) value = WATER + 55;
      if (inside(x, y, 96, 142, 11, 10)) value = WATER + 700;
      if (inside(x, y, 96, 142, 4, 4)) value = WATER + 30;
      // A fixed speckle, so the picture looks measured and is the same on every run.
      const noise = value === AIR ? 0 : ((x * 73856093) ^ (y * 19349663) ^ Math.round(t * 83492791)) & 15;
      pixels[y * SIZE + x] = value + noise;
    }
  }
  return pixels;
}

/** The sample "CT" file: eight drawn slices and an invented patient. */
export function buildDicomSample(): Uint8Array {
  const pixels = new Uint8Array(SIZE * SIZE * 2 * FRAMES);
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const slice = phantomSlice(frame / (FRAMES - 1));
    pixels.set(new Uint8Array(slice.buffer), frame * SIZE * SIZE * 2);
  }
  return encodeDicom([
    ['0008,0005', 'CS', 'ISO_IR 100'],
    ['0008,0008', 'CS', 'DERIVED\\SECONDARY'],
    ['0008,0016', 'UI', '1.2.840.10008.5.1.4.1.1.7'],
    ['0008,0018', 'UI', '2.25.329800735698586629295641978511506172918'],
    ['0008,0020', 'DA', '20250918'],
    ['0008,0030', 'TM', '104500'],
    ['0008,0050', 'SH', 'ACC-7731902'],
    ['0008,0060', 'CS', 'CT'],
    ['0008,0070', 'LO', 'MedView Phantom'],
    ['0008,0080', 'LO', 'Lakeside Imaging Center'],
    ['0008,0090', 'PN', 'Haddad^Leila^^Dr.'],
    ['0008,1030', 'LO', 'CT chest without contrast'],
    ['0008,103E', 'LO', 'Axial 5 mm, drawn phantom'],
    ['0008,1090', 'LO', 'Synthetic 64'],
    ['0010,0010', 'PN', 'Okonkwo^Daniel'],
    ['0010,0020', 'LO', 'MV-2025-0931'],
    ['0010,0030', 'DA', '19790512'],
    ['0010,0040', 'CS', 'M'],
    ['0018,0015', 'CS', 'CHEST'],
    ['0018,0050', 'DS', '5'],
    ['0018,0060', 'DS', '120'],
    ['0020,000D', 'UI', '2.25.117357550898198415937979788256743016827'],
    ['0020,000E', 'UI', '2.25.166042219238366731579726413313981421112'],
    ['0020,0011', 'IS', '2'],
    ['0020,0013', 'IS', '1'],
    ['0028,0002', 'US', 1],
    ['0028,0004', 'CS', 'MONOCHROME2'],
    ['0028,0008', 'IS', String(FRAMES)],
    ['0028,0010', 'US', SIZE],
    ['0028,0011', 'US', SIZE],
    ['0028,0100', 'US', 16],
    ['0028,0101', 'US', 12],
    ['0028,0102', 'US', 11],
    ['0028,0103', 'US', 0],
    ['0028,0301', 'CS', 'NO'],
    ['0028,1050', 'DS', '-300'],
    ['0028,1051', 'DS', '1500'],
    ['0028,1052', 'DS', '-1024'],
    ['0028,1053', 'DS', '1'],
    ['7FE0,0010', 'OW', pixels],
  ]);
}
