import { classifyBodySystem } from '@/domain/bodySystems';
import { systemName } from '@/domain/codes';
import { calcAge, normalizeDate } from '@/domain/dates';
import { classifyPanel, deriveFlag, isAbnormal, isVitalSign, parseNumeric, parseRefRange } from '@/domain/labs';
import { plural, RecordBuilder } from '@/domain/record';
import type { Coding, IdItem, LabItem } from '@/domain/types';
import { compact } from '../shared/access';
import type { ParsedDocument } from '../types';
import { UnreadableFileError } from '../types';
import { at, component, field, repetitions, segmentId, tokenize, type Segment } from './tokenizer';

const SEX: Record<string, string> = { M: 'male', F: 'female', O: 'other', U: 'unknown', A: 'ambiguous' };
const PATIENT_CLASS: Record<string, string> = { I: 'Hospitalization', O: 'Outpatient visit', E: 'Emergency visit', P: 'Pre-admission', R: 'Recurring visit', B: 'Obstetrics' };
const SEVERITY: Record<string, string> = { SV: 'severe', MO: 'moderate', MI: 'mild', U: 'unknown' };
const ID_TYPES: Record<string, string> = { MR: 'MRN', SS: 'SSN', PI: 'Patient ID', DL: "Driver's license", NI: 'National ID', MA: 'Medicaid', MC: 'Medicare', PPN: 'Passport' };

/** State carried from segment to segment while walking a message. */
interface Walk {
  builder: RecordBuilder;
  patientNode?: string;
  encounterNode?: string;
  reportNode?: string;
  panel?: string;
  panelDate?: string;
  messageType?: string;
  lastItemSource?: string;
}

function warn(walk: Walk, segment: Segment, message: string): void {
  walk.builder.warn(message, segmentId(segment), { line: segment.line });
}

function dateAt(walk: Walk, segment: Segment, n: number): string | undefined {
  const raw = at(segment, n);
  if (!raw) return undefined;
  const date = normalizeDate(raw);
  if (!date) warn(walk, segment, `Invalid date "${raw}" in ${segment.name}-${n}`);
  return date;
}

/** CWE/CE field: identifier^text^system. */
function coded(segment: Segment, n: number): { text?: string; codes: Coding[] } {
  const code = at(segment, n, 1);
  const text = at(segment, n, 2);
  return { text: text ?? code, codes: code && text ? [{ code, display: text, system: systemName(at(segment, n, 3)) }] : [] };
}

/** XPN/XCN name: family^given^middle (XCN has an id in front). */
function personName(segment: Segment, value: string, offset = 0): string | undefined {
  const part = (c: number) => component(segment, value, c + offset);
  return compact([part(5), part(2), part(3), part(1), part(4)]).join(' ') || undefined;
}

/** PID-3 (repeating CX) plus the legacy SSN field PID-19, without duplicates. */
function readIdentifiers(segment: Segment): IdItem[] {
  const ids = repetitions(segment, 3).flatMap((rep) => {
    const value = component(segment, rep, 1);
    const type = component(segment, rep, 5) ?? 'MR';
    return value ? [{ label: ID_TYPES[type] ?? type, value }] : [];
  });
  const ssn = at(segment, 19);
  if (ssn && !ids.some((id) => id.value === ssn)) ids.push({ label: 'SSN', value: ssn });
  return ids;
}

function attach(walk: Walk, nodeId: string): void {
  const parent = walk.encounterNode ?? walk.patientNode;
  if (parent) walk.builder.addEdge(parent, nodeId);
}

const HANDLERS: Record<string, (segment: Segment, walk: Walk) => string> = {
  MSH(segment, walk) {
    const type = compact([at(segment, 9, 1), at(segment, 9, 2)]).join('^');
    walk.messageType = type || undefined;
    walk.builder.record.meta.version ??= at(segment, 12);
    walk.encounterNode = undefined;
    walk.reportNode = undefined;
    walk.panel = undefined;
    if (!type) warn(walk, segment, 'Missing message type in MSH-9');
    return `Message header ${type}`.trim();
  },

  PID(segment, walk) {
    const { patient } = walk.builder.record;
    const id = segmentId(segment);
    const name = personName(segment, field(segment, 5));
    if (!name) warn(walk, segment, 'Missing patient name in PID-5');
    if (!patient.sourceId) {
      const dob = dateAt(walk, segment, 7)?.slice(0, 10);
      const sex = at(segment, 8);
      const address = compact([1, 2, 3, 4, 5, 6].map((c) => at(segment, 11, c))).join(', ');
      Object.assign(patient, {
        name,
        dob,
        age: calcAge(dob),
        sex: sex ? (SEX[sex.toUpperCase()] ?? sex) : undefined,
        sourceId: id,
        identifiers: readIdentifiers(segment),
        contacts: compact([...repetitions(segment, 13).map((rep) => component(segment, rep, 1)), at(segment, 14), address]),
      });
    }
    walk.patientNode = id;
    walk.builder.addNode({ id, kind: 'patient', label: name ?? 'Unnamed patient', sublabel: 'Patient', sourceId: id });
    return `Patient ${name ?? ''}`.trim();
  },

  PV1(segment, walk) {
    const id = segmentId(segment);
    const classCode = (at(segment, 2) ?? '').toUpperCase();
    const kind = PATIENT_CLASS[classCode] ?? 'Visit';
    const start = dateAt(walk, segment, 44);
    const provider = personName(segment, field(segment, 7), 1);
    walk.builder.record.encounters.push({
      id: walk.builder.nextId('enc'),
      sourceId: id,
      codes: [],
      kind,
      title: kind,
      start,
      end: dateAt(walk, segment, 45),
      location: at(segment, 3, 4) ?? at(segment, 3, 1),
      provider,
    });
    walk.builder.addNode({ id, kind: 'encounter', label: kind, sublabel: start?.slice(0, 10) ?? walk.messageType, sourceId: id });
    if (walk.patientNode) walk.builder.addEdge(walk.patientNode, id);
    walk.encounterNode = id;
    if (provider) {
      const doctor = `${id}:attending`;
      walk.builder.addNode({ id: doctor, kind: 'practitioner', label: provider, sublabel: 'Attending', sourceId: id });
      walk.builder.addEdge(id, doctor, 'attending');
    }
    return `${kind}${start ? ` on ${start.slice(0, 10)}` : ''}`;
  },

  AL1(segment, walk) {
    const id = segmentId(segment);
    const allergen = coded(segment, 3);
    const substance = allergen.text ?? 'Unspecified allergen';
    const severity = at(segment, 4);
    walk.builder.record.allergies.push({
      id: walk.builder.nextId('allergy'),
      sourceId: id,
      codes: allergen.codes,
      substance,
      reaction: compact(repetitions(segment, 5).map((rep) => component(segment, rep, 1))).join(', ') || undefined,
      severity: severity ? (SEVERITY[severity.toUpperCase()] ?? severity) : undefined,
      status: 'active',
      date: dateAt(walk, segment, 6),
    });
    walk.builder.addNode({ id, kind: 'allergy', label: substance, sublabel: 'Allergy', abnormal: true, sourceId: id });
    if (walk.patientNode) walk.builder.addEdge(walk.patientNode, id);
    return `Allergy: ${substance}`;
  },

  DG1(segment, walk) {
    const id = segmentId(segment);
    const diagnosis = coded(segment, 3);
    const name = at(segment, 4) ?? diagnosis.text ?? 'Unnamed diagnosis';
    const codes = diagnosis.codes.map((c) => ({ ...c, system: c.system ?? 'ICD-10' }));
    walk.builder.record.conditions.push({
      id: walk.builder.nextId('cond'),
      sourceId: id,
      codes,
      name,
      status: 'active',
      onset: dateAt(walk, segment, 5),
      bodySystem: classifyBodySystem(name, codes),
    });
    walk.builder.addNode({ id, kind: 'condition', label: name, sublabel: 'Diagnosis', sourceId: id });
    attach(walk, id);
    return `Diagnosis: ${name}`;
  },

  OBR(segment, walk) {
    const id = segmentId(segment);
    const service = coded(segment, 4);
    const title = service.text ?? 'Order';
    walk.panel = service.text;
    walk.panelDate = dateAt(walk, segment, 7) ?? dateAt(walk, segment, 6);
    walk.reportNode = id;
    walk.builder.addNode({ id, kind: 'report', label: title, sublabel: walk.panelDate?.slice(0, 10) ?? 'Order', sourceId: id });
    attach(walk, id);
    // In an order message (ORM) the OBR is the thing ordered, not a result header.
    if (walk.messageType?.startsWith('ORM')) {
      walk.builder.record.procedures.push({
        id: walk.builder.nextId('proc'),
        sourceId: id,
        codes: service.codes,
        name: title,
        date: walk.panelDate,
        status: 'ordered',
        bodySystem: classifyBodySystem(title, service.codes),
      });
    }
    return `Order: ${title}`;
  },

  OBX(segment, walk) {
    const id = segmentId(segment);
    const observation = coded(segment, 3);
    const name = observation.text ?? 'Unnamed observation';
    const valueType = (at(segment, 2) ?? '').toUpperCase();
    const isCoded = ['CE', 'CWE', 'CNE'].includes(valueType);
    const valueText = isCoded ? (at(segment, 5, 2) ?? at(segment, 5, 1)) : compact(repetitions(segment, 5).map((rep) => component(segment, rep, 1))).join(', ');
    walk.builder.addNode({ id, kind: 'observation', label: name, sublabel: 'Result', sourceId: id });
    walk.builder.addEdge(walk.reportNode ?? walk.encounterNode ?? walk.patientNode ?? id, id);
    if (!valueText) {
      warn(walk, segment, `No result value in OBX-5 for "${name}"`);
      return `Result: ${name}`;
    }
    // Free-text results are narrative, not measurements.
    if (valueType === 'TX' || valueType === 'FT') {
      walk.builder.record.documents.push({ id: walk.builder.nextId('doc'), sourceId: id, codes: observation.codes, title: name, date: walk.panelDate, text: valueText });
      return `Note: ${name}`;
    }
    const value = parseNumeric(valueText);
    const unit = at(segment, 6);
    if (valueType === 'NM' && value === undefined) warn(walk, segment, `Non-numeric value "${valueText}" in numeric OBX-5`);
    if (value !== undefined && !unit) warn(walk, segment, 'Missing unit on OBX-6');
    const range = parseRefRange(at(segment, 7));
    const flag = deriveFlag(value, range, at(segment, 8));
    const item: LabItem = {
      id: walk.builder.nextId('obs'),
      sourceId: id,
      codes: observation.codes,
      name,
      value,
      valueText,
      unit,
      refLow: range.low,
      refHigh: range.high,
      refText: range.text,
      flag,
      date: dateAt(walk, segment, 14) ?? walk.panelDate,
      bodySystem: classifyBodySystem(name, observation.codes),
    };
    if (isVitalSign(name, observation.codes)) {
      walk.builder.record.vitals.push(item);
    } else {
      item.panel = classifyPanel(name, walk.panel, observation.codes);
      walk.builder.record.labs.push(item);
    }
    const node = walk.builder.record.graph.nodes.at(-1);
    if (node?.id === id) Object.assign(node, { sublabel: compact([valueText, unit]).join(' '), abnormal: isAbnormal(flag) });
    return `Result: ${name} = ${valueText}`;
  },

  NTE(segment, walk) {
    const text = at(segment, 3);
    if (text) {
      walk.builder.record.documents.push({ id: walk.builder.nextId('doc'), sourceId: segmentId(segment), codes: [], title: 'Comment', date: walk.panelDate, text });
    }
    return 'Comment';
  },

  RXA(segment, walk) {
    const id = segmentId(segment);
    const vaccine = coded(segment, 5);
    const name = vaccine.text ?? 'Unnamed vaccine';
    walk.builder.record.immunizations.push({ id: walk.builder.nextId('imm'), sourceId: id, codes: vaccine.codes, name, date: dateAt(walk, segment, 3), status: at(segment, 20) });
    walk.builder.addNode({ id, kind: 'immunization', label: name, sublabel: 'Immunization', sourceId: id });
    attach(walk, id);
    return `Administered: ${name}`;
  },

  RXE(segment, walk) {
    const id = segmentId(segment);
    const drug = coded(segment, 2);
    const name = drug.text ?? 'Unnamed medication';
    walk.builder.record.medications.push({
      id: walk.builder.nextId('med'),
      sourceId: id,
      codes: drug.codes,
      name,
      dosage: compact([at(segment, 3), at(segment, 5, 2) ?? at(segment, 5, 1)]).join(' ') || undefined,
      status: 'active',
    });
    walk.builder.addNode({ id, kind: 'medication', label: name, sublabel: 'Medication', sourceId: id });
    attach(walk, id);
    return `Medication: ${name}`;
  },

  NK1(segment) {
    return `Next of kin ${personName(segment, field(segment, 2)) ?? ''}`.trim();
  },
};

const SEGMENT_LABELS: Record<string, string> = { EVN: 'Event', ORC: 'Order control', IN1: 'Insurance', PV2: 'Visit details', GT1: 'Guarantor', SPM: 'Specimen', PD1: 'Patient demographics' };

/** Parses one or more HL7 v2.x pipe messages (ADT, ORU, ORM, VXU…). */
export function parseHl7(text: string): ParsedDocument {
  const segments = tokenize(text);
  if (segments.length === 0) throw new UnreadableFileError('No HL7 v2 segments found', 'An HL7 v2 message starts with "MSH|^~\\&|".');
  const builder = new RecordBuilder({ format: 'hl7-v2', syntax: 'hl7' });
  const walk: Walk = { builder };
  if (segments[0].name !== 'MSH') builder.warn('Message does not start with an MSH segment', segmentId(segments[0]), { line: segments[0].line });

  for (const segment of segments) {
    let label = SEGMENT_LABELS[segment.name] ?? segment.name;
    try {
      label = HANDLERS[segment.name]?.(segment, walk) ?? label;
    } catch (error) {
      warn(walk, segment, `Could not read ${segment.name}: ${error instanceof Error ? error.message : 'unexpected structure'}`);
    }
    builder.addSource({ id: segmentId(segment), type: segment.name, label });
  }
  if (!builder.record.patient.sourceId) builder.warn('No PID (patient) segment found');

  const types = [...new Set(segments.filter((s) => s.name === 'MSH').map((s) => compact([at(s, 9, 1), at(s, 9, 2)]).join('^')))].filter(Boolean);
  const version = builder.record.meta.version;
  const rawById = new Map(segments.map((s) => [segmentId(s), s.raw]));
  return {
    record: builder.finish(compact([`HL7 v${version ?? '2'}`, types.join(', '), plural(segments.length, 'segment')]).join(' · ')),
    getSource: (id) => rawById.get(id),
  };
}
