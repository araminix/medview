import { classifyBodySystem } from '@/domain/bodySystems';
import { calcAge, normalizeDate } from '@/domain/dates';
import { plural, RecordBuilder } from '@/domain/record';
import type { BodySystem, IdItem } from '@/domain/types';
import { compact } from '../shared/access';
import { UnreadableFileError, type ParsedDocument } from '../types';
import { modalityName, PIXEL_DATA, tagInfo, transferSyntaxName } from './dictionary';
import { frameCount, renderFrame, unavailableReason } from './pixels';
import { DicomValues, readDicom, type DicomElement } from './reader';

export interface NamedBytes {
  name: string;
  bytes: Uint8Array;
}

const TEXT_VR = new Set(['AE', 'AS', 'CS', 'DA', 'DS', 'DT', 'IS', 'LO', 'LT', 'PN', 'SH', 'ST', 'TM', 'UC', 'UI', 'UR', 'UT']);
const NUMBER_VR = new Set(['US', 'SS', 'UL', 'SL', 'FL', 'FD']);
const PREVIEW = 96;
const SEX: Record<string, string> = { M: 'male', F: 'female', O: 'other' };
const GROUPS: Array<[id: string, label: string, groups: string[]]> = [
  ['file', 'File', ['0002']],
  ['study', 'Study and series', ['0008', '0020', '0032']],
  ['patient', 'Patient', ['0010']],
  ['acquisition', 'Acquisition', ['0018']],
  ['image', 'Image', ['0028', '7FE0']],
];

/** Where on the body map a scan belongs, from the body part the scanner recorded or the study's description. */
const BODY_PARTS: Array<[system: BodySystem, pattern: RegExp]> = [
  ['cardio', /heart|cardiac|coronary|aorta/i],
  ['respiratory', /chest|thorax|lung|pulmon/i],
  ['neuro', /head|brain|skull|neck|cspine|c-spine|cervical/i],
  ['renal', /kidney|renal|bladder|urinary/i],
  ['gi', /abdomen|liver|pelvis|colon|stomach|pancreas/i],
  ['musculoskeletal', /knee|hip|shoulder|hand|foot|ankle|wrist|elbow|leg|arm|spine|extremity|femur|tibia|finger|toe/i],
];

function bodySystemOf(description: string): BodySystem {
  return BODY_PARTS.find(([, pattern]) => pattern.test(description))?.[0] ?? classifyBodySystem(description, []);
}

/** "Family^Given^Middle^Prefix^Suffix" as a person would write it. */
export function personName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const [family, given, middle, prefix, suffix] = value.split('=')[0].split('^').map((part) => part.trim());
  return compact([prefix, given, middle, family, suffix]).join(' ') || undefined;
}

function describe(values: DicomValues, element: DicomElement): string {
  const info = tagInfo(element.tag);
  const vr = element.vr === 'UN' ? (info?.vr ?? 'UN') : element.vr;
  let value = `[${element.length.toLocaleString('en-US')} bytes]`;
  if (TEXT_VR.has(vr)) {
    const text = values.decode(element);
    value = text.length > PREVIEW ? `${text.slice(0, PREVIEW)}…` : text;
  } else if (NUMBER_VR.has(vr) && info && element.depth === 0) {
    value = String(values.number(info.name) ?? '');
  }
  return `${'  '.repeat(element.depth)}(${element.tag}) ${vr} ${info?.name ?? 'Unknown'}: ${value}`;
}

function dump(values: DicomValues, groups?: string[]): string {
  return values.file.elements
    .filter((element) => !groups || groups.includes(element.tag.slice(0, 4)))
    .map((element) => describe(values, element))
    .join('\n');
}

interface Slice {
  values: DicomValues;
  name: string;
  frames: number;
}

/** The files of the largest series, in the order the scanner numbered them. */
function mainSeries(files: Slice[]): { series: Slice[]; others: number } {
  const bySeries = new Map<string, Slice[]>();
  for (const file of files) {
    const key = file.values.text('SeriesInstanceUID') ?? '';
    bySeries.set(key, [...(bySeries.get(key) ?? []), file]);
  }
  const series = [...bySeries.values()].sort((a, b) => b.length - a.length)[0];
  const position = (slice: Slice) => slice.values.number('InstanceNumber') ?? slice.values.number('SliceLocation') ?? 0;
  series.sort((a, b) => position(a) - position(b) || a.name.localeCompare(b.name));
  return { series, others: bySeries.size - 1 };
}

function details(values: DicomValues, images: number): IdItem[] {
  const number = (name: string, unit: string) => {
    const value = values.number(name);
    return value === undefined ? undefined : `${value} ${unit}`;
  };
  const rows: Array<[string, string | undefined]> = [
    ['Modality', values.text('Modality') ? `${modalityName(values.text('Modality'))} (${values.text('Modality')})` : undefined],
    ['Study', values.text('StudyDescription')],
    ['Series', values.text('SeriesDescription')],
    ['Body part', values.text('BodyPartExamined')],
    ['Images', String(images)],
    ['Size', `${values.number('Columns') ?? 0} × ${values.number('Rows') ?? 0}`],
    ['Slice thickness', number('SliceThickness', 'mm')],
    ['Tube voltage', number('KVP', 'kV')],
    ['Field strength', number('MagneticFieldStrength', 'T')],
    ['Scanner', compact([values.text('Manufacturer'), values.text('ManufacturerModelName')]).join(' ') || undefined],
    ['Stored as', transferSyntaxName(values.file.transferSyntax)],
  ];
  return rows.flatMap(([label, value]) => (value ? [{ label, value }] : []));
}

/** Maps one DICOM file, or the files of a study, to a ClinicalRecord with its pictures kept for the viewer. */
export function parseDicom(input: NamedBytes[]): ParsedDocument & { text: string } {
  const skipped: string[] = [];
  const files = input.flatMap(({ name, bytes }): Slice[] => {
    try {
      const values = new DicomValues(readDicom(bytes));
      return [{ values, name, frames: frameCount(values) }];
    } catch {
      skipped.push(name);
      return [];
    }
  });
  if (files.length === 0) throw new UnreadableFileError('This DICOM file is damaged', 'Its contents could not be read.');
  const { series, others } = mainSeries(files);
  const first = series[0].values;
  const builder = new RecordBuilder({ format: 'dicom', syntax: 'dicom' });
  const { record } = builder;

  const name = personName(first.text('PatientName'));
  const dob = normalizeDate(first.text('PatientBirthDate'));
  Object.assign(record.patient, {
    name,
    dob,
    age: calcAge(dob),
    sex: SEX[(first.text('PatientSex') ?? '').toUpperCase()],
    sourceId: 'patient',
    identifiers: compact([first.text('PatientID') && { label: 'Patient ID', value: first.text('PatientID')! }, first.text('AccessionNumber') && { label: 'Accession', value: first.text('AccessionNumber')! }]),
    contacts: compact([first.text('PatientAddress'), first.text('PatientTelephoneNumbers')]),
  });
  if (!name) builder.warn('The file does not name the patient', '(0010,0010)');

  const modality = first.text('Modality');
  const study = first.text('StudyDescription') ?? first.text('RequestedProcedureDescription');
  const part = first.text('BodyPartExamined');
  const title = study ?? compact([modalityName(modality), part?.toLowerCase()]).join(' — ');
  const date = normalizeDate(`${first.text('StudyDate') ?? first.text('ContentDate') ?? ''}${(first.text('StudyTime') ?? '').slice(0, 4)}`);
  const institution = first.text('InstitutionName');
  const referrer = personName(first.text('ReferringPhysicianName'));
  record.encounters.push({ id: builder.nextId('enc'), sourceId: 'study', codes: [], kind: 'Imaging study', title, start: date, location: institution, provider: referrer });
  const procedure = compact([modalityName(modality), part ? part.toLowerCase() : first.text('SeriesDescription')]).join(' — ');
  record.procedures.push({ id: builder.nextId('proc'), sourceId: 'study', codes: [], name: procedure, date, bodySystem: bodySystemOf(`${part ?? ''} ${study ?? ''} ${first.text('SeriesDescription') ?? ''}`) });

  // Each picture the viewer can show: which file it is in, and which frame of that file.
  const pictures = series.flatMap((slice) => (unavailableReason(slice.values) ? [] : Array.from({ length: slice.frames }, (_, frame) => ({ slice, frame }))));
  const unavailable = pictures.length === 0 ? unavailableReason(first) : undefined;
  record.imaging = {
    frames: pictures.length,
    width: first.number('Columns') ?? 0,
    height: first.number('Rows') ?? 0,
    greyscale: (first.number('SamplesPerPixel') ?? 1) === 1 && first.file.transferSyntax !== '1.2.840.10008.1.2.4.50',
    unavailable,
    details: details(first, pictures.length),
  };

  for (const [id, label, groups] of GROUPS) {
    if (first.file.elements.some((element) => groups.includes(element.tag.slice(0, 4)))) builder.addSource({ id, type: 'DICOM', label });
  }
  builder.addNode({ id: 'patient', kind: 'patient', label: name ?? 'Unnamed patient', sublabel: 'Patient', sourceId: 'patient' });
  builder.addNode({ id: 'study', kind: 'encounter', label: title, sublabel: date?.slice(0, 10) ?? 'Study', sourceId: 'study' });
  builder.addNode({ id: 'series', kind: 'procedure', label: first.text('SeriesDescription') ?? procedure, sublabel: 'Series', sourceId: 'acquisition' });
  builder.addNode({ id: 'images', kind: 'report', label: plural(pictures.length, 'image'), sublabel: `${record.imaging.width} × ${record.imaging.height}`, sourceId: 'image' });
  builder.addEdge('patient', 'study');
  builder.addEdge('study', 'series');
  builder.addEdge('series', 'images');
  if (institution) {
    builder.addNode({ id: 'institution', kind: 'organization', label: institution, sublabel: 'Institution', sourceId: 'study' });
    builder.addEdge('study', 'institution', 'performed at');
  }
  if (referrer) {
    builder.addNode({ id: 'referrer', kind: 'practitioner', label: referrer, sublabel: 'Referring physician', sourceId: 'study' });
    builder.addEdge('study', 'referrer', 'referred by');
  }

  if (unavailable) builder.warn(unavailable, `(${PIXEL_DATA})`);
  if (first.file.truncated) builder.warn('The file ends in the middle of a value: it may have been cut off while copying');
  if (first.text('BurnedInAnnotation')?.toUpperCase() === 'YES') builder.warn('The file says text is burned into the picture itself; that text cannot be hidden', '(0028,0301)');
  if (others > 0) builder.warn(`Showing the largest series; ${plural(others, 'other series').replace(/seriess$/, 'series')} in the archive not shown`, undefined, { severity: 'info' });
  if (skipped.length) builder.warn(`${plural(skipped.length, 'file')} in the archive could not be read: ${skipped.slice(0, 3).join(', ')}`);

  const groupsById = new Map(GROUPS.map(([id, , groups]) => [id, groups]));
  const summary = compact(['DICOM', modality, plural(pictures.length, 'image')]).join(' · ');
  return {
    record: builder.finish(summary),
    text: dump(first),
    getSource: (id) => (groupsById.has(id) ? dump(first, groupsById.get(id)) : undefined),
    renderFrame: (index, options) => {
      const picture = pictures[index];
      return picture ? renderFrame(picture.slice.values, picture.frame, options) : undefined;
    },
  };
}
