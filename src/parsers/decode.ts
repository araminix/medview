import { unzipSync } from 'fflate';
import { CLINICAL_RECORD, convertHealthExport, isHealthExport } from './appleHealth';
import type { NamedBytes } from './dicom/parseDicom';
import { isDicom } from './dicom/reader';
import { UnreadableFileError } from './types';

const SUPPORTED = 'MedView reads FHIR (JSON or XML), HL7 v2, C-CDA, IPS, openEHR, Apple Health and DICOM files.';

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

const BINARY_SIGNATURES: Array<[kind: string, signature: number[], offset?: number]> = [
  ['a Windows program', [0x4d, 0x5a]],
  ['a PDF document', [0x25, 0x50, 0x44, 0x46]],
  ['a PNG image', [0x89, 0x50, 0x4e, 0x47]],
  ['a JPEG image', [0xff, 0xd8, 0xff]],
  ['a GIF image', [0x47, 0x49, 0x46, 0x38]],
  ['a video file', [0x66, 0x74, 0x79, 0x70], 4],
  ['a Linux program', [0x7f, 0x45, 0x4c, 0x46]],
  ['a gzip archive', [0x1f, 0x8b]],
  ['a legacy Office document', [0xd0, 0xcf, 0x11, 0xe0]],
];

function rejectBinary(bytes: Uint8Array): void {
  const known = BINARY_SIGNATURES.find(([, signature, offset]) => startsWith(bytes, signature, offset));
  if (known) throw new UnreadableFileError(`This looks like ${known[0]}, not a medical record file`, SUPPORTED);
}

function looksBinary(text: string): boolean {
  const sample = text.slice(0, 4000);
  let control = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    if (code === 0 || code === 0xfffd || (code < 9 && code > 0)) control += 1;
  }
  return sample.length > 0 && control / sample.length > 0.02;
}

/** Honours a byte-order mark first, then an XML encoding declaration, defaulting to UTF-8. */
function decodeText(bytes: Uint8Array): string {
  if (startsWith(bytes, [0xff, 0xfe])) return new TextDecoder('utf-16le').decode(bytes);
  if (startsWith(bytes, [0xfe, 0xff])) return new TextDecoder('utf-16be').decode(bytes);
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  const declared = /^<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(utf8.slice(0, 200))?.[1]?.toLowerCase();
  if (declared && declared !== 'utf-8' && declared !== 'utf8') {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      // Unknown label: the UTF-8 reading is the best we have.
    }
  }
  return utf8;
}

/** Written as a char code so no invisible character lives in the source. */
const BOM = String.fromCharCode(0xfeff);

export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(1) : text;
}

const TEXT_ENTRY = /\.(json|xml|hl7|txt|ccda|cda|ccd)$/i;

export interface DecodedFile {
  text: string;
  /** Present when the text was taken out of a zip archive. */
  archiveNote?: string;
}

/** Turns dropped bytes into text: rejects binaries, unpacks zip archives, strips the BOM. */
export function decodeFile(bytes: Uint8Array): DecodedFile {
  if (bytes.length === 0) throw new UnreadableFileError('This file is empty');
  if (startsWith(bytes, ZIP)) return decodeArchive(bytes);
  rejectBinary(bytes);
  // An Apple Health export can be too large for one string; it is read in pieces and reduced.
  if (isHealthExport(new TextDecoder().decode(bytes.subarray(0, 20000)))) return { text: convertHealthExport(bytes) };
  const text = stripBom(decodeText(bytes));
  if (looksBinary(text)) throw new UnreadableFileError('This file is not readable text', SUPPORTED);
  return { text };
}

function decodeArchive(bytes: Uint8Array): DecodedFile {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => TEXT_ENTRY.test(file.name) && !file.name.includes('__MACOSX') });
  } catch {
    throw new UnreadableFileError('This zip archive is damaged and could not be opened');
  }
  const entries = Object.entries(files).sort(([, a], [, b]) => b.length - a.length);
  const health = entries.find(([name, content]) => /(^|\/)export\.xml$/i.test(name) && isHealthExport(new TextDecoder().decode(content.subarray(0, 20000))));
  if (health) return decodeHealthArchive(health, entries);
  if (entries.length === 0) throw new UnreadableFileError('No medical record files found inside this zip archive', SUPPORTED);
  const [name, content] = entries[0];
  const { text } = decodeFile(content);
  const others = entries.length - 1;
  return { text, archiveNote: `Opened "${name}" from the archive${others ? ` (${others} other file${others === 1 ? '' : 's'} not shown)` : ''}` };
}

/** An Apple Health export.zip: export.xml with the measurements, and one FHIR file per clinical record. */
function decodeHealthArchive([name, content]: [string, Uint8Array], entries: Array<[string, Uint8Array]>): DecodedFile {
  const clinical = entries.flatMap(([path, bytes]) => {
    if (!CLINICAL_RECORD.test(path)) return [];
    try {
      return [JSON.parse(new TextDecoder().decode(bytes)) as unknown];
    } catch {
      return [];
    }
  });
  const records = clinical.length ? ` with ${clinical.length} clinical record${clinical.length === 1 ? '' : 's'}` : '';
  return { text: convertHealthExport(content, clinical), archiveNote: `Opened "${name}" from the Apple Health archive${records}` };
}

const ZIP = [0x50, 0x4b, 0x03, 0x04];
/** Files in a study archive that are certainly not DICOM images, so they need not be unpacked to check. */
const NOT_DICOM = /\.(json|xml|hl7|txt|ccda|cda|ccd|pdf|jpe?g|png|gif|bmp|html?|css|js|exe|dll|inf|ico|md|csv)$|(^|\/)(DICOMDIR|__MACOSX)/i;

export interface DicomInput {
  files: NamedBytes[];
  /** Present when the files came out of a zip archive. */
  archiveNote?: string;
}

/** The DICOM files in what was dropped: the file itself, or the images inside a zip archive of a study. */
export function dicomFiles(bytes: Uint8Array): DicomInput | undefined {
  if (isDicom(bytes)) return { files: [{ name: 'image.dcm', bytes }] };
  if (!startsWith(bytes, ZIP)) return undefined;
  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = unzipSync(bytes, { filter: (file) => !NOT_DICOM.test(file.name) && file.originalSize > 132 });
  } catch {
    return undefined;
  }
  const files = Object.entries(unpacked).flatMap(([name, content]) => (isDicom(content) ? [{ name, bytes: content }] : []));
  if (files.length === 0) return undefined;
  return { files, archiveNote: `Opened ${files.length} DICOM image${files.length === 1 ? '' : 's'} from the archive` };
}
