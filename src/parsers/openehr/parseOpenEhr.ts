import { normalizeDate } from '@/domain/dates';
import { RecordBuilder } from '@/domain/record';
import { isObj, objs, pick, str, type Obj } from '../shared/access';
import { UnreadableFileError, type ParsedDocument } from '../types';
import { nameOf, typeOf } from './access';
import { mapEntry } from './entries';

const ENTRY_TYPES = new Set(['OBSERVATION', 'EVALUATION', 'INSTRUCTION', 'ACTION', 'ADMIN_ENTRY']);
const COMPOSITION_ID = 'composition';

/** True for a canonical openEHR composition, bare or wrapped as servers return it ({ composition: … }). */
export function findComposition(root: unknown): Obj | undefined {
  if (!isObj(root)) return undefined;
  if (typeOf(root) === 'COMPOSITION' || /^openEHR-EHR-COMPOSITION\./i.test(str(root.archetype_node_id) ?? '')) return root;
  return isObj(root.composition) ? findComposition(root.composition) : undefined;
}

/** The "flat" and "structured" web-template formats name every value by its path instead of nesting it. */
export function isFlatOpenEhr(root: unknown): boolean {
  return isObj(root) && Object.keys(root).some((key) => /^ctx\/|\/.+\|/.test(key));
}

interface Located {
  entry: Obj;
  section?: string;
}

function entriesOf(items: unknown, section?: string): Located[] {
  return objs(items).flatMap((item): Located[] => {
    if (typeOf(item) === 'SECTION' || (!ENTRY_TYPES.has(typeOf(item)) && 'items' in item)) return entriesOf(item.items, nameOf(item) ?? section);
    return [{ entry: item, section }];
  });
}

/** Maps a canonical openEHR COMPOSITION (JSON, or XML converted to the same shape) to a ClinicalRecord. */
export function parseOpenEhr(root: unknown, syntax: 'json' | 'xml', rawOf?: (node: Obj) => string | undefined): ParsedDocument {
  const composition = findComposition(root);
  if (!composition) throw new UnreadableFileError('This file is not an openEHR composition', 'A composition has "_type": "COMPOSITION" and an archetype_node_id.');
  const builder = new RecordBuilder({ format: 'openehr', syntax });
  const title = nameOf(composition) ?? 'Composition';
  const start = normalizeDate(str(pick(composition, 'context.start_time.value')) ?? '');
  const composer = str(pick(composition, 'composer.name'));
  const facility = str(pick(composition, 'context.health_care_facility.name'));
  const sources = new Map<string, Obj>([[COMPOSITION_ID, composition]]);

  builder.warn('openEHR compositions do not carry the patient’s name or birth date: those are kept in a separate demographic record', undefined, { severity: 'info' });
  builder.addSource({ id: COMPOSITION_ID, type: 'COMPOSITION', label: title });
  builder.addNode({ id: COMPOSITION_ID, kind: 'report', label: title, sublabel: start?.slice(0, 10) ?? 'Composition', sourceId: COMPOSITION_ID });
  if (composer) {
    builder.addNode({ id: 'composer', kind: 'practitioner', label: composer, sublabel: 'Composer' });
    builder.addEdge(COMPOSITION_ID, 'composer', 'composer');
  }
  if (facility) {
    builder.addNode({ id: 'facility', kind: 'organization', label: facility, sublabel: 'Facility' });
    builder.addEdge(COMPOSITION_ID, 'facility', 'facility');
  }
  if (start || facility) {
    builder.record.encounters.push({ id: builder.nextId('enc'), sourceId: COMPOSITION_ID, codes: [], kind: 'Visit', title, start, end: normalizeDate(str(pick(composition, 'context.end_time.value')) ?? ''), location: facility, provider: composer });
  }

  const located = entriesOf(composition.content);
  if (located.length === 0) builder.warn('Composition contains no entries', 'content');
  located.forEach(({ entry }, index) => {
    const type = typeOf(entry) || 'ENTRY';
    const id = `${type.toLowerCase()}-${index + 1}`;
    sources.set(id, entry);
    let mapped: ReturnType<typeof mapEntry> = { kind: 'other', label: nameOf(entry) ?? type, sublabel: type };
    try {
      mapped = mapEntry(entry, { builder, sourceId: id, fallbackDate: start });
    } catch (error) {
      builder.warn(`Could not read ${type}: ${error instanceof Error ? error.message : 'unexpected structure'}`, id);
    }
    builder.addSource({ id, type, label: mapped.label });
    builder.addNode({ id, ...mapped, sourceId: id });
    builder.addEdge(COMPOSITION_ID, id);
  });

  return {
    record: builder.finish(`openEHR · ${located.length.toLocaleString('en-US')} ${located.length === 1 ? 'entry' : 'entries'}`),
    getSource: (id) => {
      const node = sources.get(id);
      return node ? (rawOf?.(node) ?? JSON.stringify(node, null, 2)) : undefined;
    },
  };
}
