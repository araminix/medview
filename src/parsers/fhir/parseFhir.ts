import { plural, RecordBuilder } from '@/domain/record';
import { isObj, objs, pick, str, type Obj } from '../shared/access';
import type { ParsedDocument } from '../types';
import { UnreadableFileError } from '../types';
import { APPLE_HEALTH_TAG, SOURCE_TAG_SYSTEM } from '../appleHealth';
import { absentStatement, isPatientSummary } from './ips';
import { describeUnmapped, FHIR_MAPPERS, type FhirContext } from './mappers';

interface Entry {
  resource: Obj;
  id: string;
  fullUrl?: string;
}

/** Resources that only carry supporting data and would clutter the graph. */
const HIDDEN_FROM_GRAPH = new Set(['Medication', 'Provenance', 'Binary', 'OperationOutcome']);

function collectEntries(root: Obj): Entry[] {
  const resources: Array<{ resource: Obj; fullUrl?: string }> =
    root.resourceType === 'Bundle'
      ? objs(root.entry).flatMap((e) => (isObj(e.resource) ? [{ resource: e.resource, fullUrl: str(e.fullUrl) }] : []))
      : [{ resource: root }];
  const seen = new Map<string, number>();
  return resources.map(({ resource, fullUrl }, index) => {
    const type = str(resource.resourceType) ?? 'Unknown';
    let id = resource.id ? `${type}/${str(resource.id)}` : `${type}#${index + 1}`;
    // Duplicate ids exist in messy exports; keep every resource addressable.
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    if (count > 1) id = `${id}~${count}`;
    return { resource, fullUrl, id };
  });
}

function buildResolver(entries: Entry[]): (reference: string | undefined) => Entry | undefined {
  const index = new Map<string, Entry>();
  for (const entry of entries) {
    if (!index.has(entry.id)) index.set(entry.id, entry);
    if (entry.fullUrl && !index.has(entry.fullUrl)) index.set(entry.fullUrl, entry);
  }
  return (reference) => {
    if (!reference) return undefined;
    // "Patient/1/_history/2" and absolute URLs resolve through their Type/id tail.
    const tail = /([A-Za-z]+\/[^/]+)(?:\/_history\/[^/]+)?$/.exec(reference)?.[1];
    return index.get(reference) ?? (tail ? index.get(tail) : undefined);
  };
}

/** R5 moved a few elements; their presence is the only reliable hint inside a bare bundle. */
function detectVersion(entries: Entry[]): 'fhir-r4' | 'fhir-r5' {
  const isR5 = entries.some(({ resource: r }) => {
    switch (r.resourceType) {
      case 'Encounter':
        return Array.isArray(r.class) || 'actualPeriod' in r;
      case 'MedicationRequest':
      case 'MedicationStatement':
        return isObj(r.medication) && ('concept' in r.medication || isObj(r.medication.reference));
      case 'MedicationUsage':
        return true;
      default:
        return str(pick(r, 'meta.profile'))?.includes('/5.0') ?? false;
    }
  });
  return isR5 ? 'fhir-r5' : 'fhir-r4';
}

/** Every Reference inside a resource, with the top-level property it sits under. */
function* references(value: unknown, topKey = ''): Generator<{ key: string; reference: string }> {
  if (Array.isArray(value)) {
    for (const item of value) yield* references(item, topKey);
  } else if (isObj(value)) {
    if (typeof value.reference === 'string') yield { key: topKey, reference: value.reference };
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'contained' && typeof child === 'object') yield* references(child, topKey || key);
    }
  }
}

function linkGraph(entries: Entry[], builder: RecordBuilder, resolve: ReturnType<typeof buildResolver>, isBundle: boolean): void {
  const reported = new Set<string>();
  for (const { resource, id } of entries) {
    if (!builder.hasNode(id)) continue;
    const refs = [...references(resource)].filter((r) => !r.reference.startsWith('#'));
    const inEncounter = refs.some((r) => r.key === 'encounter' || r.key === 'context');
    for (const { key, reference } of refs) {
      const target = resolve(reference);
      if (!target) {
        if (isBundle && !reported.has(reference)) {
          reported.add(reference);
          builder.warn(`Unresolved reference: ${reference}`, `${id}.${key}`);
        }
        continue;
      }
      if (key === 'subject' || key === 'patient') {
        // Items seen during an encounter hang off the encounter instead of the patient.
        if (!inEncounter) builder.addEdge(target.id, id);
      } else if (key === 'encounter' || key === 'context' || key === 'partOf') {
        builder.addEdge(target.id, id);
      } else {
        builder.addEdge(id, target.id, key);
      }
    }
  }
}

/** Maps a parsed FHIR Bundle or standalone resource (R4/R5) to a ClinicalRecord. */
export function parseFhir(root: unknown, syntax: 'json' | 'xml', rawOf?: (resource: Obj) => string | undefined): ParsedDocument {
  if (!isObj(root) || typeof root.resourceType !== 'string') {
    throw new UnreadableFileError('This file is not a FHIR resource', 'A FHIR file has a "resourceType" such as Bundle or Patient.');
  }
  const entries = collectEntries(root);
  const resolveEntry = buildResolver(entries);
  const fhirVersion = detectVersion(entries);
  const summaryDocument = isPatientSummary(root);
  const fromAppleHealth = objs(pick(root, 'meta.tag')).some((tag) => tag.system === SOURCE_TAG_SYSTEM && tag.code === APPLE_HEALTH_TAG);
  const builder = new RecordBuilder({ format: fromAppleHealth ? 'apple-health' : summaryDocument ? 'eu-ips' : fhirVersion, version: fhirVersion === 'fhir-r5' ? 'R5' : 'R4', syntax, fhirPath: true });
  const byResource = new Map<Obj, Entry>(entries.map((e) => [e.resource, e]));
  const ctx: FhirContext = {
    builder,
    idOf: (resource) => byResource.get(resource)?.id ?? 'unknown',
    resolve: (reference) => resolveEntry(reference)?.resource,
  };

  const isBundle = root.resourceType === 'Bundle';
  if (fromAppleHealth) {
    builder.warn('Converted from an Apple Health export: each measurement shows its latest reading, and daily totals are a 30-day average', undefined, { severity: 'info' });
  }
  if (isBundle && entries.length === 0) builder.warn('Bundle contains no resources', 'entry');

  for (const entry of entries) {
    const type = str(entry.resource.resourceType) ?? 'Unknown';
    const absent = absentStatement(entry.resource);
    if (absent) {
      // "No known allergies" is a statement about the record, not an allergy.
      builder.warn(`The file states: ${absent}`, entry.id, { severity: 'info' });
      builder.addSource({ id: entry.id, type, label: absent });
      continue;
    }
    let mapped = describeUnmapped(entry.resource);
    try {
      mapped = (FHIR_MAPPERS[type] ?? describeUnmapped)(entry.resource, ctx);
    } catch (error) {
      builder.warn(`Could not read ${type}: ${error instanceof Error ? error.message : 'unexpected structure'}`, entry.id);
    }
    builder.addSource({ id: entry.id, type, label: mapped.label });
    if (!HIDDEN_FROM_GRAPH.has(type)) builder.addNode({ id: entry.id, ...mapped, sourceId: entry.id });
  }
  linkGraph(entries, builder, resolveEntry, isBundle);

  if (isBundle && !builder.record.patient.sourceId) builder.warn('No Patient resource found in bundle');

  const sourceById = new Map(entries.map((e) => [e.id, e.resource]));
  const version = fromAppleHealth ? 'Apple Health' : `${summaryDocument ? 'IPS · ' : ''}${fhirVersion === 'fhir-r5' ? 'FHIR R5' : 'FHIR R4'}`;
  return {
    record: builder.finish(`${version} · ${isBundle ? plural(entries.length, 'resource') : String(root.resourceType)}`),
    fhirRoot: root,
    getSource: (id) => {
      const resource = sourceById.get(id);
      if (!resource) return undefined;
      return rawOf?.(resource) ?? JSON.stringify(resource, null, 2);
    },
  };
}
