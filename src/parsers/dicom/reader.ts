import { inflateSync } from 'fflate';
import { UnreadableFileError } from '../types';
import { PIXEL_DATA, tagInfo, tagOf } from './dictionary';

const PREAMBLE = 128;
const UNDEFINED_LENGTH = 0xffffffff;
const ITEM = 0xe000;
const ITEM_END = 0xe00d;
const SEQUENCE_END = 0xe0dd;
/** Value representations whose explicit header carries a 4-byte length. */
const LONG_VR = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'UC', 'UN', 'UR', 'UT', 'SV', 'UV']);
const MAX_DEPTH = 16;

export interface DicomElement {
  tag: string;
  vr: string;
  /** Where the value starts in `DicomFile.data`, and how long it is. */
  offset: number;
  length: number;
  /** 0 for the attributes of the file itself; deeper for those inside a sequence item. */
  depth: number;
}

export interface Span {
  offset: number;
  length: number;
}

export interface DicomFile {
  /** The bytes the element offsets point into: the file itself, or its inflated data set. */
  data: Uint8Array;
  /** False when `data` is not the file as it was dropped (deflated), so it cannot be edited in place. */
  editable: boolean;
  littleEndian: boolean;
  transferSyntax: string;
  /** Every element in file order, those inside sequences included. */
  elements: DicomElement[];
  /** Compressed pixel data comes as fragments; uncompressed pixel data is an ordinary element. */
  fragments?: Span[];
  truncated: boolean;
}

export function isDicom(bytes: Uint8Array): boolean {
  return bytes.length > PREAMBLE + 4 && bytes[128] === 0x44 && bytes[129] === 0x49 && bytes[130] === 0x43 && bytes[131] === 0x4d;
}

const hex = (value: number) => value.toString(16).toUpperCase().padStart(4, '0');

class Walker {
  readonly elements: DicomElement[] = [];
  fragments?: Span[];
  truncated = false;
  private readonly view: DataView;

  constructor(
    private readonly data: Uint8Array,
    private readonly explicit: boolean,
    private readonly littleEndian: boolean,
  ) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  private u16(at: number): number {
    return this.view.getUint16(at, this.littleEndian);
  }

  private u32(at: number): number {
    return this.view.getUint32(at, this.littleEndian);
  }

  /** Reads elements from `start` to `end`, or to the item delimiter when the item has no stated length. */
  walk(start: number, end: number, depth: number): number {
    let at = start;
    while (at + 8 <= end) {
      const group = this.u16(at);
      const element = this.u16(at + 2);
      if (group === 0xfffe) {
        // A delimiter closes the item or sequence being read; its caller continues after it.
        return element === ITEM_END || element === SEQUENCE_END ? at + 8 : at;
      }
      const tag = `${hex(group)},${hex(element)}`;
      let vr = tagInfo(tag)?.vr ?? 'UN';
      let header = 8;
      let length: number;
      if (this.explicit) {
        vr = String.fromCharCode(this.data[at + 4], this.data[at + 5]);
        if (LONG_VR.has(vr)) {
          if (at + 12 > end) break;
          length = this.u32(at + 8);
          header = 12;
        } else {
          length = this.u16(at + 6);
        }
      } else {
        length = this.u32(at + 4);
      }
      const value = at + header;
      if (length === UNDEFINED_LENGTH) {
        at = tag === PIXEL_DATA && depth === 0 ? this.readFragments(value, end) : this.readItems(value, end, depth);
        continue;
      }
      if (value + length > end) {
        this.truncated = true;
        this.elements.push({ tag, vr, offset: value, length: Math.max(0, end - value), depth });
        return end;
      }
      this.elements.push({ tag, vr, offset: value, length, depth });
      if (vr === 'SQ' && depth < MAX_DEPTH) this.readItems(value, value + length, depth);
      at = value + length;
    }
    return at;
  }

  /** The items of a sequence, each one a small data set of its own. */
  private readItems(start: number, end: number, depth: number): number {
    let at = start;
    while (at + 8 <= end) {
      if (this.u16(at) !== 0xfffe) return at;
      const element = this.u16(at + 2);
      const length = this.u32(at + 4);
      at += 8;
      if (element === SEQUENCE_END) return at;
      if (element !== ITEM) continue;
      if (depth >= MAX_DEPTH) return end;
      at = length === UNDEFINED_LENGTH ? this.walk(at, end, depth + 1) : Math.max(this.walk(at, Math.min(at + length, end), depth + 1), Math.min(at + length, end));
    }
    return at;
  }

  /** Compressed pixel data: an offset table, then one or more fragments, then a delimiter. */
  private readFragments(start: number, end: number): number {
    const fragments: Span[] = [];
    let at = start;
    let first = true;
    while (at + 8 <= end) {
      const element = this.u16(at + 2);
      const length = this.u32(at + 4);
      at += 8;
      if (this.u16(at - 8) !== 0xfffe || element === SEQUENCE_END) break;
      if (at + length > end) {
        this.truncated = true;
        break;
      }
      // The first item is the offset table, not a picture.
      if (!first) fragments.push({ offset: at, length });
      first = false;
      at += length;
    }
    this.fragments = fragments;
    return at;
  }
}

/** Reads the structure of a DICOM Part 10 file: where every attribute's value sits. Values are decoded on demand. */
export function readDicom(bytes: Uint8Array): DicomFile {
  if (!isDicom(bytes)) throw new UnreadableFileError('This file is not a DICOM file', 'A DICOM file has the letters DICM after its first 128 bytes.');
  // The file meta group is always explicit and little endian, whatever the rest of the file uses.
  const meta = new Walker(bytes, true, true);
  let at = PREAMBLE + 4;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (at + 8 <= bytes.length && view.getUint16(at, true) === 0x0002) {
    const before = meta.elements.length;
    at = meta.walk(at, nextGroup(view, at, bytes.length), 0);
    if (meta.elements.length === before) break;
  }
  const syntaxElement = meta.elements.find((element) => element.tag === tagOf('TransferSyntaxUID'));
  const transferSyntax = syntaxElement ? ascii(bytes, syntaxElement) : '1.2.840.10008.1.2';
  const deflated = transferSyntax === '1.2.840.10008.1.2.1.99';
  const littleEndian = transferSyntax !== '1.2.840.10008.1.2.2';
  const explicit = transferSyntax !== '1.2.840.10008.1.2';

  let data = bytes;
  let start = at;
  if (deflated) {
    try {
      data = inflateSync(bytes.subarray(at));
    } catch {
      throw new UnreadableFileError('This DICOM file is damaged', 'Its compressed data could not be unpacked.');
    }
    start = 0;
  }
  const body = new Walker(data, explicit, littleEndian);
  body.walk(start, data.length, 0);
  return {
    data,
    editable: !deflated,
    littleEndian,
    transferSyntax,
    elements: deflated ? body.elements : [...meta.elements, ...body.elements],
    fragments: body.fragments,
    truncated: meta.truncated || body.truncated,
  };
}

/** End of the element that starts at `at`, so the meta group is read one element at a time. */
function nextGroup(view: DataView, at: number, end: number): number {
  const vr = String.fromCharCode(view.getUint8(at + 4), view.getUint8(at + 5));
  const size = LONG_VR.has(vr) ? 12 + view.getUint32(at + 8, true) : 8 + view.getUint16(at + 6, true);
  return Math.min(end, at + size);
}

function ascii(data: Uint8Array, span: Span): string {
  let text = '';
  for (let i = span.offset; i < span.offset + span.length; i += 1) text += String.fromCharCode(data[i]);
  return text.replace(/[\0 ]+$/, '');
}

/** Typed access to the top-level attributes of one file. */
export class DicomValues {
  private readonly byTag = new Map<string, DicomElement>();
  private readonly decoder: TextDecoder;

  constructor(readonly file: DicomFile) {
    for (const element of file.elements) if (element.depth === 0 && !this.byTag.has(element.tag)) this.byTag.set(element.tag, element);
    const charset = this.raw('SpecificCharacterSet') ?? '';
    // ISO_IR 192 is UTF-8; everything else is read as Latin-1, which covers the default repertoire.
    this.decoder = new TextDecoder(/ISO_IR 192/.test(charset) ? 'utf-8' : 'windows-1252');
  }

  element(name: string): DicomElement | undefined {
    return this.byTag.get(tagOf(name));
  }

  private raw(name: string): string | undefined {
    const element = this.element(name);
    return element ? ascii(this.file.data, element) : undefined;
  }

  decode(element: DicomElement): string {
    return this.decoder.decode(this.file.data.subarray(element.offset, element.offset + element.length)).replace(/[\0 ]+$/, '').trim();
  }

  text(name: string): string | undefined {
    const element = this.element(name);
    return (element && this.decode(element).split('\\')[0].trim()) || undefined;
  }

  /** A number stored as binary (US, SS, UL, SL, FL, FD) or as a decimal or integer string (DS, IS). */
  number(name: string, index = 0): number | undefined {
    const element = this.element(name);
    if (!element || element.length === 0) return undefined;
    const view = new DataView(this.file.data.buffer, this.file.data.byteOffset + element.offset, element.length);
    const le = this.file.littleEndian;
    const vr = element.vr === 'UN' ? (tagInfo(element.tag)?.vr ?? 'UN') : element.vr;
    const sizes: Record<string, [number, (at: number) => number]> = {
      US: [2, (at) => view.getUint16(at, le)], SS: [2, (at) => view.getInt16(at, le)], UL: [4, (at) => view.getUint32(at, le)],
      SL: [4, (at) => view.getInt32(at, le)], FL: [4, (at) => view.getFloat32(at, le)], FD: [8, (at) => view.getFloat64(at, le)],
    };
    const binary = sizes[vr];
    if (binary) return (index + 1) * binary[0] <= element.length ? binary[1](index * binary[0]) : undefined;
    const value = Number(this.decode(element).split('\\')[index]);
    return Number.isFinite(value) ? value : undefined;
  }
}
