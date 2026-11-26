import { healthKey, healthType } from './catalog';
import type { HealthScan } from './types';

const TAG = /<(Record|ClinicalRecord|Me|ExportDate)\b([^>]*)>/g;
const ATTRIBUTE = /([\w:]+)="([^"]*)"/g;
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [, name, value] of source.matchAll(ATTRIBUTE)) result[name] = value.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => ENTITIES[entity]);
  return result;
}

/** "2025-01-09 08:00:00 +0100" → "2025-01-09T08:00:00+01:00". */
export function isoDate(value: string | undefined): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2}):?(\d{2})?/.exec(value ?? '');
  if (match) return `${match[1]}T${match[2]}${match[3]}:${match[4] ?? '00'}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : undefined;
}

function addRecord(scan: HealthScan, attrs: Record<string, string>): void {
  scan.records += 1;
  const key = healthKey(attrs.type);
  const value = Number(attrs.value);
  const date = isoDate(attrs.startDate);
  if (!key || !date || !Number.isFinite(value)) return;
  const unit = attrs.unit ?? '';
  if (healthType(key).reduce === 'latest') {
    const known = scan.latest.get(key);
    if (!known || date > known.date) scan.latest.set(key, { value, unit, date, count: (known?.count ?? 0) + 1 });
    else known.count += 1;
    return;
  }
  let series = scan.daily.get(key);
  if (!series) scan.daily.set(key, (series = { unit, days: new Map() }));
  const day = date.slice(0, 10);
  let sources = series.days.get(day);
  if (!sources) series.days.set(day, (sources = new Map()));
  const source = attrs.sourceName ?? '';
  sources.set(source, (sources.get(source) ?? 0) + value);
}

/**
 * Reads an Apple Health export.xml in one pass, piece by piece. Exports reach hundreds of megabytes
 * and millions of readings, so the file is never held as one document: each tag is read and reduced.
 */
export function scanHealthExport(chunks: Iterable<string>): HealthScan {
  const scan: HealthScan = { records: 0, latest: new Map(), daily: new Map(), clinicalFiles: [] };
  let carry = '';
  for (const chunk of chunks) {
    const text = carry + chunk;
    // A tag cut in two by the chunk boundary waits for the next piece.
    const cut = text.lastIndexOf('<');
    const complete = cut >= 0 && !text.includes('>', cut) ? text.slice(0, cut) : text;
    carry = text.slice(complete.length);
    for (const [, tag, source] of complete.matchAll(TAG)) {
      const attrs = attributes(source);
      if (tag === 'Record') addRecord(scan, attrs);
      else if (tag === 'ClinicalRecord') attrs.resourceFilePath && scan.clinicalFiles.push(attrs.resourceFilePath);
      else if (tag === 'ExportDate') scan.exportDate = isoDate(attrs.value);
      else {
        scan.birthDate = isoDate(attrs.HKCharacteristicTypeIdentifierDateOfBirth);
        scan.sex = attrs.HKCharacteristicTypeIdentifierBiologicalSex;
        scan.bloodType = attrs.HKCharacteristicTypeIdentifierBloodType;
      }
    }
  }
  return scan;
}

/** Decodes bytes a few megabytes at a time, so a huge export never becomes one huge string. */
export function* decodeChunks(bytes: Uint8Array, size = 4 * 1024 * 1024): Generator<string> {
  const decoder = new TextDecoder('utf-8');
  for (let offset = 0; offset < bytes.length; offset += size) {
    yield decoder.decode(bytes.subarray(offset, offset + size), { stream: true });
  }
  yield decoder.decode();
}
