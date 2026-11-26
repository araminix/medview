import { classifyBodySystem } from '@/domain/bodySystems';
import { calcAge, normalizeDate } from '@/domain/dates';
import { classifyPanel, deriveFlag, flagFromCode, isVitalSign, parseNumeric, parseRefRange, rangeText, type RefRange } from '@/domain/labs';
import type { RecordBuilder } from '@/domain/record';
import type { Coding, GraphNodeKind, LabFlag, LabItem } from '@/domain/types';
import { arr, compact, firstStr, isObj, num, objs, pick, pickStr, str, type Obj } from '../shared/access';
import { clinicalStatus, codingsOf, conceptText, firstCode, humanName, referenceDisplay, referenceOf } from './access';
import { describeDosage } from './dosage';

export interface FhirContext {
  builder: RecordBuilder;
  /** Stable id of a resource, also used as source id and graph node id. */
  idOf(resource: Obj): string;
  resolve(reference: string | undefined): Obj | undefined;
}

interface Mapped {
  kind: GraphNodeKind;
  label: string;
  sublabel?: string;
  abnormal?: boolean;
}

type Mapper = (resource: Obj, ctx: FhirContext) => Mapped;

function dateOf(ctx: FhirContext, resource: Obj, ...paths: string[]): string | undefined {
  const raw = firstStr(resource, ...paths);
  if (!raw) return undefined;
  const date = normalizeDate(raw);
  if (!date) ctx.builder.warn(`Invalid date "${raw}"`, ctx.idOf(resource));
  return date;
}

function displayOf(ctx: FhirContext, reference: unknown): string | undefined {
  const target = ctx.resolve(referenceOf(reference));
  if (target) return humanName(target.name) ?? str(target.name) ?? referenceDisplay(reference);
  return referenceDisplay(reference);
}

const mapPatient: Mapper = (r, ctx) => {
  const { patient } = ctx.builder.record;
  const name = humanName(r.name);
  if (!name) ctx.builder.warn('Patient has no name', ctx.idOf(r));
  // A bundle may hold several Patient resources; the first one is the record subject.
  if (!patient.sourceId) {
    const dob = dateOf(ctx, r, 'birthDate');
    Object.assign(patient, {
      name,
      dob,
      age: r.deceasedDateTime || r.deceasedBoolean === true ? undefined : calcAge(dob),
      sex: str(r.gender),
      deceased: Boolean(r.deceasedDateTime) || r.deceasedBoolean === true,
      sourceId: ctx.idOf(r),
      identifiers: objs(r.identifier).flatMap((id) => {
        const value = str(id.value);
        return value ? [{ label: conceptText(id.type) ?? firstCode(id.type) ?? 'ID', value }] : [];
      }),
      contacts: compact([
        ...objs(r.telecom).map((t) => str(t.value)),
        ...objs(r.address).map((a) =>
          str(a.text) ?? compact([...arr(a.line).map(str), str(a.city), str(a.state), str(a.postalCode), str(a.country)]).join(', '),
        ),
      ]),
    });
  }
  return { kind: 'patient', label: name ?? 'Unnamed patient', sublabel: 'Patient' };
};

const mapAllergy: Mapper = (r, ctx) => {
  const reaction = objs(r.reaction)[0];
  const substance = conceptText(r.code) ?? conceptText(reaction?.substance) ?? 'Unspecified allergen';
  const manifestation = objs(reaction?.manifestation)[0];
  ctx.builder.record.allergies.push({
    id: ctx.builder.nextId('allergy'),
    sourceId: ctx.idOf(r),
    codes: codingsOf(r.code),
    substance,
    // R5 wraps the manifestation in a CodeableReference ({ concept }).
    reaction: conceptText(manifestation?.concept ?? manifestation) ?? str(reaction?.description),
    severity: str(reaction?.severity) ?? str(r.criticality),
    status: clinicalStatus(r, ['active', ''], ['inactive', 'resolved']),
    date: dateOf(ctx, r, 'onsetDateTime', 'recordedDate'),
  });
  return { kind: 'allergy', label: substance, sublabel: 'Allergy', abnormal: true };
};

function quantityText(quantity: unknown): { value?: number; text?: string; unit?: string } {
  if (!isObj(quantity)) return {};
  const value = num(quantity.value);
  const comparator = str(quantity.comparator) ?? '';
  return { value, text: value !== undefined ? `${comparator}${value}` : undefined, unit: str(quantity.unit) ?? str(quantity.code) };
}

function readValue(r: Obj): { value?: number; text?: string; unit?: string } {
  if (r.valueQuantity) return quantityText(r.valueQuantity);
  const scalar = str(r.valueString) ?? str(r.valueInteger) ?? str(r.valueDecimal) ?? str(r.valueBoolean) ?? str(r.valueDateTime);
  if (scalar) return { value: parseNumeric(scalar), text: scalar };
  if (r.valueCodeableConcept) return { text: conceptText(r.valueCodeableConcept) };
  if (isObj(r.valueRatio)) {
    const n = quantityText(r.valueRatio.numerator).text;
    const d = quantityText(r.valueRatio.denominator).text;
    return { text: n && d ? `${n}:${d}` : undefined };
  }
  return {};
}

function readRange(r: Obj): RefRange {
  const range = objs(r.referenceRange)[0];
  if (!range) return {};
  const low = num(pick(range, 'low.value'));
  const high = num(pick(range, 'high.value'));
  const text = str(range.text);
  if (low === undefined && high === undefined) return parseRefRange(text);
  return { low, high, text: text ?? rangeText(low, high) };
}

function worstFlag(flags: LabFlag[]): LabFlag {
  const order: LabFlag[] = ['critical', 'high', 'low', 'abnormal', 'normal', 'unknown'];
  return order.find((flag) => flags.includes(flag)) ?? 'unknown';
}

const mapObservation: Mapper = (r, ctx) => {
  const codes = codingsOf(r.code);
  const name = conceptText(r.code) ?? 'Unnamed observation';
  const category = objs(r.category).map((c) => `${firstCode(c) ?? ''} ${conceptText(c) ?? ''}`).join(' ');
  const components = objs(r.component);
  let reading = readValue(r);
  let range = readRange(r);
  let flag = deriveFlag(reading.value, range, firstCode(r.interpretation));

  // Multi-component results (blood pressure) collapse into one "128/82" reading.
  if (!reading.text && components.length) {
    const parts = components.map((c) => ({ value: readValue(c), range: readRange(c), code: firstCode(c.interpretation) }));
    reading = { text: compact(parts.map((p) => p.value.text)).join('/'), unit: parts.find((p) => p.value.unit)?.value.unit };
    range = { text: compact(parts.map((p) => p.range.text)).join(' / ') || undefined };
    flag = flagFromCode(firstCode(r.interpretation)) ?? worstFlag(parts.map((p) => deriveFlag(p.value.value, p.range, p.code)));
  }

  const label: Mapped = { kind: 'observation', label: name, sublabel: compact([reading.text, reading.unit]).join(' ') || 'Observation' };
  // Panels (hasMember) and observations without a result carry no value of their own.
  if (!reading.text) {
    if (!arr(r.hasMember).length) ctx.builder.warn(`Observation "${name}" has no value`, ctx.idOf(r));
    return label;
  }

  const item: LabItem = {
    id: ctx.builder.nextId('obs'),
    sourceId: ctx.idOf(r),
    codes,
    name,
    value: reading.value,
    valueText: reading.text,
    unit: reading.unit,
    refLow: range.low,
    refHigh: range.high,
    refText: range.text,
    flag,
    date: dateOf(ctx, r, 'effectiveDateTime', 'effectivePeriod.start', 'effectiveInstant', 'issued'),
    bodySystem: classifyBodySystem(name, codes),
  };
  if (isVitalSign(name, codes, category)) {
    ctx.builder.record.vitals.push(item);
  } else {
    item.panel = classifyPanel(name, undefined, codes);
    ctx.builder.record.labs.push(item);
  }
  return { ...label, abnormal: flag !== 'normal' && flag !== 'unknown' };
};

/** Medication can be inline (CodeableConcept), a Reference, or an R5 CodeableReference. */
function medicationOf(r: Obj, ctx: FhirContext): { name: string; codes: Coding[] } {
  const inline = r.medicationCodeableConcept ?? pick(r, 'medication.concept');
  const reference = r.medicationReference ?? pick(r, 'medication.reference') ?? r.medication;
  const target = ctx.resolve(referenceOf(reference) ?? str(pick(reference, 'reference')));
  const concept = inline ?? target?.code;
  return { name: conceptText(concept) ?? referenceDisplay(reference) ?? 'Unnamed medication', codes: codingsOf(concept) };
}

const mapMedication: Mapper = (r, ctx) => {
  const { name, codes } = medicationOf(r, ctx);
  const dosage = objs(r.dosageInstruction ?? r.dosage)[0];
  const status = (str(r.status) ?? '').toLowerCase();
  ctx.builder.record.medications.push({
    id: ctx.builder.nextId('med'),
    sourceId: ctx.idOf(r),
    codes,
    name,
    dosage: describeDosage(dosage),
    route: conceptText(dosage?.route),
    status: ['active', 'intended', 'on-hold', 'recorded'].includes(status)
      ? 'active'
      : ['completed', 'stopped', 'cancelled', 'ended', 'entered-in-error', 'not-taken'].includes(status)
        ? 'inactive'
        : 'unknown',
    date: dateOf(ctx, r, 'authoredOn', 'effectiveDateTime', 'effectivePeriod.start', 'dateAsserted'),
    prescriber: displayOf(ctx, r.requester ?? r.informationSource),
  });
  return { kind: 'medication', label: name, sublabel: 'Medication' };
};

const mapCondition: Mapper = (r, ctx) => {
  const codes = codingsOf(r.code);
  const name = conceptText(r.code) ?? 'Unnamed condition';
  ctx.builder.record.conditions.push({
    id: ctx.builder.nextId('cond'),
    sourceId: ctx.idOf(r),
    codes,
    name,
    status: clinicalStatus(r, ['active', 'recurrence', 'relapse'], ['inactive', 'remission', 'resolved']),
    onset: dateOf(ctx, r, 'onsetDateTime', 'onsetPeriod.start', 'recordedDate'),
    resolved: dateOf(ctx, r, 'abatementDateTime', 'abatementPeriod.end'),
    bodySystem: classifyBodySystem(name, codes),
  });
  return { kind: 'condition', label: name, sublabel: 'Condition' };
};

const ENCOUNTER_CLASSES: Record<string, string> = {
  AMB: 'Outpatient visit', IMP: 'Hospitalization', ACUTE: 'Hospitalization', EMER: 'Emergency visit',
  HH: 'Home visit', VR: 'Virtual visit', OBSENC: 'Observation stay', SS: 'Short stay',
};

const mapEncounter: Mapper = (r, ctx) => {
  // R4: class is a Coding; R5: an array of CodeableConcepts.
  const classCode = (str(pick(r, 'class.code')) ?? pickStr(r, 'class.coding.code') ?? '').toUpperCase();
  const kind = ENCOUNTER_CLASSES[classCode] ?? 'Visit';
  const title = conceptText(objs(r.type)[0]) ?? str(pick(r, 'class.display')) ?? kind;
  const start = dateOf(ctx, r, 'period.start', 'actualPeriod.start');
  ctx.builder.record.encounters.push({
    id: ctx.builder.nextId('enc'),
    sourceId: ctx.idOf(r),
    codes: codingsOf(objs(r.type)[0]),
    kind,
    title,
    start,
    end: dateOf(ctx, r, 'period.end', 'actualPeriod.end'),
    location: displayOf(ctx, pick(r, 'location.location')) ?? displayOf(ctx, r.serviceProvider),
    provider: displayOf(ctx, pick(r, 'participant.individual') ?? pick(r, 'participant.actor')),
    reason: conceptText(objs(r.reasonCode)[0]) ?? conceptText(pick(r, 'reason.value.concept')),
  });
  return { kind: 'encounter', label: title, sublabel: start?.slice(0, 10) ?? kind };
};

const mapImmunization: Mapper = (r, ctx) => {
  const name = conceptText(r.vaccineCode) ?? 'Unnamed vaccine';
  ctx.builder.record.immunizations.push({
    id: ctx.builder.nextId('imm'),
    sourceId: ctx.idOf(r),
    codes: codingsOf(r.vaccineCode),
    name,
    date: dateOf(ctx, r, 'occurrenceDateTime', 'recorded'),
    status: str(r.status),
  });
  return { kind: 'immunization', label: name, sublabel: 'Immunization' };
};

const mapProcedure: Mapper = (r, ctx) => {
  const codes = codingsOf(r.code);
  const name = conceptText(r.code) ?? 'Unnamed procedure';
  ctx.builder.record.procedures.push({
    id: ctx.builder.nextId('proc'),
    sourceId: ctx.idOf(r),
    codes,
    name,
    date: dateOf(ctx, r, 'performedDateTime', 'performedPeriod.start', 'occurrenceDateTime', 'occurrencePeriod.start'),
    status: str(r.status),
    bodySystem: classifyBodySystem(name, codes),
  });
  return { kind: 'procedure', label: name, sublabel: 'Procedure' };
};

function addNarrative(r: Obj, ctx: FhirContext, title: string, narrative: unknown, date?: string): void {
  const html = pickStr(narrative, 'div');
  if (!html) return;
  ctx.builder.record.documents.push({ id: ctx.builder.nextId('doc'), sourceId: ctx.idOf(r), codes: [], title, date, html });
}

const mapReport: Mapper = (r, ctx) => {
  const title = conceptText(r.code) ?? conceptText(r.type) ?? 'Report';
  const date = dateOf(ctx, r, 'effectiveDateTime', 'effectivePeriod.start', 'issued', 'date');
  const conclusion = str(r.conclusion);
  if (conclusion) {
    ctx.builder.record.documents.push({ id: ctx.builder.nextId('doc'), sourceId: ctx.idOf(r), codes: codingsOf(r.code), title, date, text: conclusion });
  } else {
    addNarrative(r, ctx, title, r.text, date);
  }
  return { kind: 'report', label: title, sublabel: 'Report' };
};

const mapComposition: Mapper = (r, ctx) => {
  const title = str(r.title) ?? conceptText(r.type) ?? 'Clinical document';
  const date = dateOf(ctx, r, 'date');
  for (const section of objs(r.section)) addNarrative(r, ctx, str(section.title) ?? conceptText(section.code) ?? title, section.text, date);
  return { kind: 'report', label: title, sublabel: 'Document' };
};

const mapPractitioner: Mapper = (r) => ({ kind: 'practitioner', label: humanName(r.name) ?? 'Practitioner', sublabel: 'Practitioner' });
const mapOrganization: Mapper = (r) => ({ kind: 'organization', label: str(r.name) ?? 'Organization', sublabel: str(r.resourceType) });

export const FHIR_MAPPERS: Record<string, Mapper> = {
  Patient: mapPatient,
  AllergyIntolerance: mapAllergy,
  Observation: mapObservation,
  MedicationRequest: mapMedication,
  MedicationStatement: mapMedication,
  MedicationUsage: mapMedication,
  MedicationOrder: mapMedication,
  Condition: mapCondition,
  Encounter: mapEncounter,
  Immunization: mapImmunization,
  Procedure: mapProcedure,
  DiagnosticReport: mapReport,
  DocumentReference: mapReport,
  Composition: mapComposition,
  Practitioner: mapPractitioner,
  Organization: mapOrganization,
  Location: mapOrganization,
};

export function describeUnmapped(resource: Obj): Mapped {
  const type = str(resource.resourceType) ?? 'Resource';
  return { kind: 'other', label: conceptText(resource.code) ?? str(resource.name) ?? humanName(resource.name) ?? type, sublabel: type };
}
