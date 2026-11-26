import { classifyBodySystem } from '@/domain/bodySystems';
import { normalizeDate } from '@/domain/dates';
import { classifyPanel, deriveFlag, rangeText } from '@/domain/labs';
import type { RecordBuilder } from '@/domain/record';
import type { GraphNodeKind, LabItem } from '@/domain/types';
import { compact, num, objs, pick, str, type Obj } from '../shared/access';
import { codesOf, conceptOf, dvText, find, isQuantity, leaves, measure, nameOf, typeOf, type Leaf } from './access';

export interface Mapped {
  kind: GraphNodeKind;
  label: string;
  sublabel?: string;
  abnormal?: boolean;
}

interface Context {
  builder: RecordBuilder;
  sourceId: string;
  /** Start of the encounter the composition records; the date of entries that carry none. */
  fallbackDate?: string;
}

const date = (value: unknown) => normalizeDate(str(value) ?? '');
const text = (leaf: Leaf | undefined) => (leaf ? dvText(leaf.value) : undefined);

function reading(ctx: Context, name: string, leaf: Leaf, when: string | undefined, lab: boolean, panel?: string, named?: Leaf): LabItem | undefined {
  const measured = measure(leaf.value);
  if (!measured) return undefined;
  const low = num(pick(leaf.value, 'normal_range.lower.magnitude'));
  const high = num(pick(leaf.value, 'normal_range.upper.magnitude'));
  // A laboratory analyte is coded on its name, not on its result.
  const codes = [...(named ? codesOf(named.value) : []), ...codesOf(leaf.value)];
  const item: LabItem = {
    id: ctx.builder.nextId('obs'),
    sourceId: ctx.sourceId,
    codes,
    name,
    value: measured.value,
    valueText: measured.text,
    unit: measured.unit,
    refLow: low,
    refHigh: high,
    refText: rangeText(low, high),
    flag: deriveFlag(measured.value, { low, high }, str(pick(leaf.value, 'normal_status.code_string'))),
    date: when,
    bodySystem: classifyBodySystem(name, codes),
  };
  if (lab) {
    item.panel = classifyPanel(name, panel, codes);
    ctx.builder.record.labs.push(item);
  } else {
    ctx.builder.record.vitals.push(item);
  }
  return item;
}

const abnormal = (items: Array<LabItem | undefined>) => items.some((item) => item && item.flag !== 'normal' && item.flag !== 'unknown');

/** A laboratory result: one analyte per cluster, each with its name beside its value. */
function mapLaboratory(ctx: Context, label: string, events: Array<{ data: unknown; time?: string }>): Mapped {
  const items: Array<LabItem | undefined> = [];
  for (const event of events) {
    const all = leaves(event.data);
    const panel = text(find(all, /^(test|panel) name$/i)) ?? label;
    const clusters = new Map<Obj | undefined, Leaf[]>();
    for (const leaf of all) clusters.set(leaf.cluster, [...(clusters.get(leaf.cluster) ?? []), leaf]);
    for (const [cluster, members] of clusters) {
      const result = members.find((leaf) => isQuantity(leaf.value));
      if (!result) continue;
      const named = find(members, /(analyte|test|result) name/i);
      const name = text(named) ?? (cluster ? nameOf(cluster) : undefined) ?? result.name;
      items.push(reading(ctx, name, result, event.time, true, panel, named));
    }
  }
  return { kind: 'report', label, sublabel: 'Laboratory result', abnormal: abnormal(items) };
}

function mapObservation(entry: Obj, ctx: Context): Mapped {
  const label = nameOf(entry) ?? 'Observation';
  const concept = conceptOf(entry);
  const origin = date(pick(entry, 'data.origin.value'));
  const events = objs(pick(entry, 'data.events')).map((event) => ({ data: event.data, time: date(pick(event, 'time.value')) ?? origin ?? ctx.fallbackDate }));
  if (/lab|test_result/.test(concept)) return mapLaboratory(ctx, label, events);

  const items: Array<LabItem | undefined> = [];
  for (const event of events) {
    const quantities = leaves(event.data).filter((leaf) => isQuantity(leaf.value));
    const systolic = find(quantities, /systolic/i);
    const diastolic = find(quantities, /diastolic/i);
    if (systolic && diastolic) {
      // Two readings of one measurement: shown as the familiar "128/82".
      const [high, low] = [measure(systolic.value), measure(diastolic.value)];
      const item = reading(ctx, 'Blood pressure', systolic, event.time, false);
      if (item && high && low) Object.assign(item, { value: undefined, valueText: `${high.text}/${low.text}`, flag: 'unknown', refLow: undefined, refHigh: undefined, refText: undefined });
      items.push(item);
    }
    const rest = quantities.filter((leaf) => leaf !== systolic && leaf !== diastolic);
    // "Rate" or "Weight" alone says little; the entry it sits in ("Pulse", "Body weight") names it.
    for (const leaf of systolic && diastolic ? [] : rest) items.push(reading(ctx, rest.length === 1 ? label : `${label}: ${leaf.name}`, leaf, event.time, false));
  }
  const first = items.find(Boolean);
  if (!first) return mapNote(entry, ctx);
  return { kind: 'observation', label, sublabel: compact([first.valueText, first.unit]).join(' '), abnormal: abnormal(items) };
}

function mapProblem(ctx: Context, all: Leaf[], entry: Obj): Mapped {
  const named = find(all, /(problem|diagnosis).*name|^diagnosis$|^problem$/i) ?? all[0];
  const name = text(named) ?? nameOf(entry) ?? 'Unnamed condition';
  const codes = named ? codesOf(named.value) : [];
  const resolved = date(text(find(all, /date.*(resolution|abatement|remission)/i)));
  const state = all.map((leaf) => `${leaf.name} ${dvText(leaf.value) ?? ''}`).join(' ');
  ctx.builder.record.conditions.push({
    id: ctx.builder.nextId('cond'),
    sourceId: ctx.sourceId,
    codes,
    name,
    status: resolved || /\b(resolved|inactive|remission)\b/i.test(state) ? 'inactive' : 'active',
    onset: date(text(find(all, /date.*(onset|recognition|diagnos)/i))),
    resolved,
    bodySystem: classifyBodySystem(name, codes),
  });
  return { kind: 'condition', label: name, sublabel: 'Condition' };
}

function mapAllergy(ctx: Context, all: Leaf[]): Mapped {
  const named = find(all, /substance|agent|allergen|causative/i) ?? all[0];
  const substance = text(named) ?? 'Unspecified allergen';
  ctx.builder.record.allergies.push({
    id: ctx.builder.nextId('allergy'),
    sourceId: ctx.sourceId,
    codes: named ? codesOf(named.value) : [],
    substance,
    reaction: text(find(all, /manifestation|reaction( description)?$/i)),
    severity: text(find(all, /severity|criticality/i)),
    status: 'active',
    date: date(text(find(all, /onset/i))),
  });
  return { kind: 'allergy', label: substance, sublabel: 'Allergy', abnormal: true };
}

function mapMedication(ctx: Context, all: Leaf[], entry: Obj): Mapped {
  const named = find(all, /medication (item|name)|^(medication|medicine|name)$/i) ?? all[0];
  const name = text(named) ?? nameOf(entry) ?? 'Unnamed medication';
  const state = (str(pick(entry, 'ism_transition.current_state.value')) ?? '').toLowerCase();
  const dosage = compact([text(find(all, /^dose( amount)?$/i)), text(find(all, /direction|dosage|frequency|timing/i))]).join(' — ') || str(pick(entry, 'narrative.value'));
  ctx.builder.record.medications.push({
    id: ctx.builder.nextId('med'),
    sourceId: ctx.sourceId,
    codes: named ? codesOf(named.value) : [],
    name,
    dosage: dosage && dosage !== name ? dosage : undefined,
    route: text(find(all, /^route/i)),
    status: /completed|aborted|cancelled|expired/.test(state) ? 'inactive' : 'active',
    date: date(pick(entry, 'time.value')) ?? ctx.fallbackDate,
  });
  return { kind: 'medication', label: name, sublabel: 'Medication' };
}

function mapProcedure(ctx: Context, all: Leaf[], entry: Obj): Mapped {
  const named = find(all, /procedure( name)?$/i) ?? all[0];
  const name = text(named) ?? nameOf(entry) ?? 'Unnamed procedure';
  const codes = named ? codesOf(named.value) : [];
  ctx.builder.record.procedures.push({
    id: ctx.builder.nextId('proc'),
    sourceId: ctx.sourceId,
    codes,
    name,
    date: date(pick(entry, 'time.value')) ?? ctx.fallbackDate,
    status: str(pick(entry, 'ism_transition.current_state.value')),
    bodySystem: classifyBodySystem(name, codes),
  });
  return { kind: 'procedure', label: name, sublabel: 'Procedure' };
}

function mapImmunization(ctx: Context, all: Leaf[], entry: Obj): Mapped {
  const named = find(all, /vaccine|immuni[sz]ation item|medication item/i) ?? all[0];
  const name = text(named) ?? nameOf(entry) ?? 'Unnamed vaccine';
  ctx.builder.record.immunizations.push({ id: ctx.builder.nextId('imm'), sourceId: ctx.sourceId, codes: named ? codesOf(named.value) : [], name, date: date(pick(entry, 'time.value')) ?? ctx.fallbackDate });
  return { kind: 'immunization', label: name, sublabel: 'Immunization' };
}

/** Whatever has no place of its own in the report is kept readable as a note. */
function mapNote(entry: Obj, ctx: Context): Mapped {
  const title = nameOf(entry) ?? 'Entry';
  const lines = entryLeaves(entry).flatMap((leaf) => {
    const value = dvText(leaf.value);
    return value ? [`${leaf.name}: ${value}`] : [];
  });
  const narrative = str(pick(entry, 'narrative.value'));
  if (narrative) lines.unshift(narrative);
  if (lines.length) ctx.builder.record.documents.push({ id: ctx.builder.nextId('doc'), sourceId: ctx.sourceId, codes: [], title, date: ctx.fallbackDate, text: lines.join('\n') });
  return { kind: 'other', label: title, sublabel: typeOf(entry).toLowerCase().replace(/_/g, ' ') };
}

/** The elements of an entry, wherever its class keeps them. */
function entryLeaves(entry: Obj): Leaf[] {
  return [
    ...leaves(entry.data),
    ...objs(pick(entry, 'data.events')).flatMap((event) => leaves(event.data)),
    ...leaves(entry.description),
    ...objs(entry.activities).flatMap((activity) => leaves(activity.description)),
  ];
}

const BY_CONCEPT: Array<[pattern: RegExp, map: (ctx: Context, all: Leaf[], entry: Obj) => Mapped]> = [
  [/immuni[sz]ation|vaccin/, mapImmunization],
  [/adverse_reaction|allerg/, mapAllergy],
  [/problem|diagnosis/, mapProblem],
  [/medication|prescription/, mapMedication],
  [/procedure/, mapProcedure],
];

/** Reads one OBSERVATION, EVALUATION, INSTRUCTION, ACTION or ADMIN_ENTRY into the record. */
export function mapEntry(entry: Obj, ctx: Context): Mapped {
  if (typeOf(entry) === 'OBSERVATION') return mapObservation(entry, ctx);
  const concept = conceptOf(entry);
  const mapper = BY_CONCEPT.find(([pattern]) => pattern.test(concept))?.[1];
  const all = entryLeaves(entry);
  return mapper && all.length ? mapper(ctx, all, entry) : mapNote(entry, ctx);
}
