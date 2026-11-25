import { calcAge, normalizeDate } from '@/domain/dates';
import { plural, RecordBuilder } from '@/domain/record';
import { compact } from '../shared/access';
import { attr, child, descendants, elementChildren, find, findAll, serializeXml, textOf, type XmlDocument, type XmlElement } from '../shared/xml';
import type { ParsedDocument } from '../types';
import { UnreadableFileError } from '../types';
import { personName } from './access';
import { SECTION_HANDLERS, type SectionContext } from './sections';

const SEX: Record<string, string> = { M: 'male', F: 'female', UN: 'undifferentiated', UNK: 'unknown' };
const SSN_ROOT = '2.16.840.1.113883.4.1';

function addressText(addr: XmlElement | undefined): string | undefined {
  if (!addr) return undefined;
  const parts = ['streetAddressLine', 'city', 'state', 'postalCode', 'country'].flatMap((name) => elementChildren(addr, name).map(textOf));
  return compact(parts).join(', ') || undefined;
}

function readPatient(root: XmlElement, builder: RecordBuilder, sourceId: string): string | undefined {
  const role = find(root, 'recordTarget/patientRole');
  if (!role) {
    builder.warn('No <recordTarget> (patient) found', 'ClinicalDocument');
    return undefined;
  }
  const person = child(role, 'patient');
  const name = personName(child(person, 'name'));
  if (!name) builder.warn('Patient has no name', 'recordTarget/patientRole/patient');
  const rawDob = attr(child(person, 'birthTime'), 'value');
  const dob = normalizeDate(rawDob)?.slice(0, 10);
  if (rawDob && !dob) builder.warn(`Invalid birth date "${rawDob}"`, 'recordTarget/patientRole/patient/birthTime');
  const sexCode = attr(child(person, 'administrativeGenderCode'), 'code');
  Object.assign(builder.record.patient, {
    name,
    dob,
    age: calcAge(dob),
    sex: sexCode ? (SEX[sexCode.toUpperCase()] ?? attr(child(person, 'administrativeGenderCode'), 'displayName') ?? sexCode) : undefined,
    sourceId,
    identifiers: elementChildren(role, 'id').flatMap((id) => {
      const value = attr(id, 'extension');
      return value ? [{ label: attr(id, 'root') === SSN_ROOT ? 'SSN' : 'MRN', value }] : [];
    }),
    contacts: compact([
      ...elementChildren(role, 'telecom').map((t) => attr(t, 'value')?.replace(/^(tel|mailto):/i, '')),
      ...elementChildren(role, 'addr').map(addressText),
    ]),
  });
  return name;
}

/** Narrative blocks tag fragments with ID attributes that coded entries point back to. */
function indexNarrative(root: XmlElement): Map<string, string> {
  const index = new Map<string, string>();
  descendants(root, (element) => {
    const id = attr(element, 'ID');
    const text = id ? textOf(element) : undefined;
    if (id && text) index.set(id, text);
  });
  return index;
}

/** Maps a US C-CDA document (CCD, discharge summary, referral note…) to a ClinicalRecord. */
export function parseCcda(document: XmlDocument): ParsedDocument {
  const root = document.documentElement;
  if (!root || root.localName !== 'ClinicalDocument') {
    throw new UnreadableFileError('This XML file is not a C-CDA document', 'A C-CDA file has a <ClinicalDocument> root element.');
  }
  const builder = new RecordBuilder({ format: 'ccda', syntax: 'xml' });
  const elements = new Map<string, XmlElement>();
  const narrative = indexNarrative(root);
  let counter = 0;

  const source: SectionContext['source'] = (element, type, label) => {
    counter += 1;
    const id = `${type.replace(/\s+/g, '')}#${counter}`;
    elements.set(id, element);
    builder.addSource({ id, type, label });
    return id;
  };

  const patientElement = child(root, 'recordTarget');
  const patientNode = patientElement ? source(patientElement, 'Patient', 'Patient') : 'Patient#0';
  const patientName = readPatient(root, builder, patientNode);
  const patientSource = builder.record.sources.find((s) => s.id === patientNode);
  if (patientSource) patientSource.label = patientName ?? 'Unnamed patient';
  builder.addNode({ id: patientNode, kind: 'patient', label: patientName ?? 'Unnamed patient', sublabel: 'Patient', sourceId: patientNode });

  const ctx: SectionContext = {
    builder,
    patientNode,
    source,
    resolve: (reference) => (reference ? narrative.get(reference.replace(/^#/, '')) : undefined),
  };

  const author = find(root, 'author/assignedAuthor');
  const authorName = personName(find(author, 'assignedPerson/name'));
  if (author && authorName) {
    const id = source(author, 'Author', authorName);
    builder.addNode({ id, kind: 'practitioner', label: authorName, sublabel: 'Author', sourceId: id });
    builder.addEdge(patientNode, id, 'author');
  }
  const custodian = find(root, 'custodian/assignedCustodian/representedCustodianOrganization');
  const custodianName = textOf(child(custodian, 'name'));
  if (custodian && custodianName) {
    const id = source(custodian, 'Organization', custodianName);
    builder.addNode({ id, kind: 'organization', label: custodianName, sublabel: 'Custodian', sourceId: id });
    builder.addEdge(patientNode, id, 'custodian');
  }

  const sections = findAll(root, 'component/structuredBody/component/section');
  if (sections.length === 0) builder.warn('Document has no structured sections', 'component/structuredBody');
  const documentDate = normalizeDate(attr(child(root, 'effectiveTime'), 'value'));

  for (const section of sections) {
    const code = attr(child(section, 'code'), 'code');
    const title = textOf(child(section, 'title')) ?? attr(child(section, 'code'), 'displayName') ?? 'Section';
    const handler = code ? SECTION_HANDLERS[code] : undefined;
    source(section, 'Section', title);
    if (!handler) {
      const text = textOf(child(section, 'text'));
      if (text) builder.record.documents.push({ id: builder.nextId('doc'), codes: [], title, date: documentDate, text });
      continue;
    }
    try {
      handler(section, ctx);
    } catch (error) {
      builder.warn(`Could not read section "${title}": ${error instanceof Error ? error.message : 'unexpected structure'}`, title);
    }
  }

  const title = textOf(child(root, 'title')) ?? 'C-CDA';
  return {
    record: builder.finish(`C-CDA · ${title} · ${plural(sections.length, 'section')}`),
    getSource: (id) => {
      const element = elements.get(id);
      return element ? serializeXml(element) : undefined;
    },
  };
}
