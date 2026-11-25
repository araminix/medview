import { classifyBodySystem } from '@/domain/bodySystems';
import { classifyPanel, deriveFlag, isAbnormal, parseNumeric, parseRefRange, rangeText, type RefRange } from '@/domain/labs';
import type { RecordBuilder } from '@/domain/record';
import type { ClinicalStatus, GraphNodeKind, LabItem } from '@/domain/types';
import { compact } from '../shared/access';
import { attr, child, elementChildren, find, findAll, textOf, type XmlElement } from '../shared/xml';
import { codeText, codingsOf, dateOf, hasTemplate, innerObservation, personName, timeOf, type TextResolver } from './access';
import { describeFrequency } from '../fhir/dosage';

export interface SectionContext {
  builder: RecordBuilder;
  resolve: TextResolver;
  patientNode: string;
  /** Registers a raw source unit and returns its id. */
  source(element: XmlElement, type: string, label: string): string;
}

type SectionHandler = (section: XmlElement, ctx: SectionContext) => void;

function addNode(ctx: SectionContext, id: string, kind: GraphNodeKind, label: string, sublabel: string, parent = ctx.patientNode, abnormal = false): void {
  ctx.builder.addNode({ id, kind, label, sublabel, abnormal, sourceId: id });
  ctx.builder.addEdge(parent, id);
}

function statusOf(element: XmlElement | undefined, observation?: XmlElement): ClinicalStatus {
  const code = attr(child(element, 'statusCode'), 'code')?.toLowerCase();
  const ended = Boolean(attr(find(observation ?? element, 'effectiveTime/high'), 'value'));
  if (ended || code === 'completed' || code === 'aborted' || code === 'suspended') return ended || code !== 'completed' ? 'inactive' : 'unknown';
  return code === 'active' ? 'active' : 'unknown';
}

const SEVERITY_TEMPLATE = '2.16.840.1.113883.10.20.22.4.8';

const allergies: SectionHandler = (section, ctx) => {
  for (const entry of elementChildren(section, 'entry')) {
    const observation = innerObservation(entry);
    if (!observation || attr(observation, 'negationInd') === 'true') continue;
    const playing = find(observation, 'participant/participantRole/playingEntity');
    const substance = codeText(child(playing, 'code'), ctx.resolve) ?? textOf(child(playing, 'name')) ?? 'Unspecified allergen';
    const related = findAll(observation, 'entryRelationship/observation');
    const severity = related.find((o) => hasTemplate(o, SEVERITY_TEMPLATE));
    const reaction = related.find((o) => o !== severity && child(o, 'value'));
    const nestedSeverity = reaction ? findAll(reaction, 'entryRelationship/observation').find((o) => hasTemplate(o, SEVERITY_TEMPLATE)) : undefined;
    const id = ctx.source(entry, 'Allergy', substance);
    ctx.builder.record.allergies.push({
      id: ctx.builder.nextId('allergy'),
      sourceId: id,
      codes: codingsOf(child(playing, 'code')),
      substance,
      reaction: codeText(child(reaction, 'value'), ctx.resolve),
      severity: codeText(child(severity ?? nestedSeverity, 'value'), ctx.resolve)?.toLowerCase(),
      status: statusOf(child(entry, 'act'), observation) === 'inactive' ? 'inactive' : 'active',
      date: dateOf(child(observation, 'effectiveTime'), 'low'),
    });
    addNode(ctx, id, 'allergy', substance, 'Allergy', ctx.patientNode, true);
  }
};

function describeDose(administration: XmlElement): string | undefined {
  const dose = child(administration, 'doseQuantity');
  const amount = compact([attr(dose, 'value'), attr(dose, 'unit')]).join(' ');
  const period = elementChildren(administration, 'effectiveTime').map((t) => child(t, 'period')).find(Boolean);
  const value = Number(attr(period, 'value'));
  const unit = attr(period, 'unit');
  // CDA states an interval ("every 12 h"); 24 h divided by it reads better as "twice daily".
  const frequency =
    unit === 'h' && value > 0 && 24 % value === 0 && value >= 6
      ? describeFrequency(24 / value, 1, 'd')
      : describeFrequency(1, value || undefined, unit);
  return compact([amount, frequency]).join(' — ') || undefined;
}

function substanceName(administration: XmlElement, ctx: SectionContext): { name?: string; code?: XmlElement } {
  const material = find(administration, 'consumable/manufacturedProduct/manufacturedMaterial');
  const code = child(material, 'code');
  return { name: codeText(code, ctx.resolve) ?? textOf(child(material, 'name')), code };
}

const medications: SectionHandler = (section, ctx) => {
  for (const administration of findAll(section, 'entry/substanceAdministration')) {
    const { name = 'Unnamed medication', code } = substanceName(administration, ctx);
    const period = elementChildren(administration, 'effectiveTime').find((t) => child(t, 'low') || child(t, 'high'));
    const id = ctx.source(administration, 'Medication', name);
    ctx.builder.record.medications.push({
      id: ctx.builder.nextId('med'),
      sourceId: id,
      codes: codingsOf(code),
      name,
      dosage: describeDose(administration),
      route: attr(child(administration, 'routeCode'), 'displayName'),
      status: attr(child(period, 'high'), 'value') ? 'inactive' : statusOf(administration) === 'unknown' ? 'active' : statusOf(administration),
      date: dateOf(period, 'low'),
      prescriber: personName(find(administration, 'author/assignedAuthor/assignedPerson/name')),
    });
    addNode(ctx, id, 'medication', name, 'Medication');
  }
};

const problems: SectionHandler = (section, ctx) => {
  for (const entry of elementChildren(section, 'entry')) {
    const observation = innerObservation(entry);
    if (!observation || attr(observation, 'negationInd') === 'true') continue;
    const value = child(observation, 'value');
    const name = codeText(value, ctx.resolve) ?? ctx.resolve(attr(find(observation, 'text/reference'), 'value')) ?? 'Unnamed problem';
    const codes = codingsOf(value);
    const status = statusOf(child(entry, 'act'), observation);
    const id = ctx.source(entry, 'Problem', name);
    ctx.builder.record.conditions.push({
      id: ctx.builder.nextId('cond'),
      sourceId: id,
      codes,
      name,
      status: status === 'unknown' ? 'active' : status,
      onset: dateOf(child(observation, 'effectiveTime'), 'low'),
      resolved: dateOf(child(observation, 'effectiveTime'), 'high'),
      bodySystem: classifyBodySystem(name, codes),
    });
    addNode(ctx, id, 'condition', name, 'Problem');
  }
};

function readRange(observation: XmlElement): RefRange {
  const range = find(observation, 'referenceRange/observationRange');
  const value = child(range, 'value');
  const low = attr(child(value, 'low'), 'value');
  const high = attr(child(value, 'high'), 'value');
  if (low || high) return { low: parseNumeric(low), high: parseNumeric(high), text: rangeText(low, high) };
  return parseRefRange(textOf(child(range, 'text')));
}

/** Results and vital signs share the organizer → component → observation layout. */
function measurements(kind: 'labs' | 'vitals'): SectionHandler {
  return (section, ctx) => {
    for (const entry of elementChildren(section, 'entry')) {
      const organizer = child(entry, 'organizer');
      const panel = codeText(child(organizer, 'code'), ctx.resolve);
      const observations = organizer ? findAll(organizer, 'component/observation') : elementChildren(entry, 'observation');
      let parent = ctx.patientNode;
      if (organizer && kind === 'labs') {
        parent = ctx.source(organizer, 'Result panel', panel ?? 'Results');
        addNode(ctx, parent, 'report', panel ?? 'Results', dateOf(child(organizer, 'effectiveTime'))?.slice(0, 10) ?? 'Panel');
      }
      for (const observation of observations) {
        const code = child(observation, 'code');
        const name = codeText(code, ctx.resolve) ?? 'Unnamed result';
        const valueElement = child(observation, 'value');
        const valueText = attr(valueElement, 'value') ?? attr(valueElement, 'displayName') ?? textOf(valueElement);
        const id = ctx.source(observation, kind === 'labs' ? 'Result' : 'Vital sign', name);
        if (!valueText) {
          ctx.builder.warn(`No value for "${name}"`, id);
          continue;
        }
        const value = parseNumeric(valueText);
        const range = readRange(observation);
        const unit = attr(valueElement, 'unit');
        const codes = codingsOf(code);
        const item: LabItem = {
          id: ctx.builder.nextId('obs'),
          sourceId: id,
          codes,
          name,
          value,
          valueText,
          unit: unit === '1' ? undefined : unit,
          refLow: range.low,
          refHigh: range.high,
          refText: range.text,
          flag: deriveFlag(value, range, attr(child(observation, 'interpretationCode'), 'code')),
          date: dateOf(child(observation, 'effectiveTime')) ?? dateOf(child(organizer, 'effectiveTime')),
          bodySystem: classifyBodySystem(name, codes),
        };
        const raw = timeOf(child(observation, 'effectiveTime'));
        if (raw && !item.date) ctx.builder.warn(`Invalid date "${raw}"`, id);
        if (kind === 'labs') item.panel = classifyPanel(name, panel, codes);
        ctx.builder.record[kind].push(item);
        addNode(ctx, id, 'observation', name, compact([valueText, item.unit]).join(' '), parent, isAbnormal(item.flag));
      }
    }
  };
}

const encounters: SectionHandler = (section, ctx) => {
  for (const encounter of findAll(section, 'entry/encounter')) {
    const title = codeText(child(encounter, 'code'), ctx.resolve) ?? 'Visit';
    const start = dateOf(child(encounter, 'effectiveTime'), 'low');
    const id = ctx.source(encounter, 'Encounter', title);
    ctx.builder.record.encounters.push({
      id: ctx.builder.nextId('enc'),
      sourceId: id,
      codes: codingsOf(child(encounter, 'code')),
      kind: /inpatient|hospital|admission/i.test(title) ? 'Hospitalization' : /emergency/i.test(title) ? 'Emergency visit' : 'Visit',
      title,
      start,
      end: dateOf(child(encounter, 'effectiveTime'), 'high'),
      location: textOf(find(encounter, 'participant/participantRole/playingEntity/name')),
      provider: personName(find(encounter, 'performer/assignedEntity/assignedPerson/name')),
    });
    addNode(ctx, id, 'encounter', title, start?.slice(0, 10) ?? 'Encounter');
  }
};

const immunizations: SectionHandler = (section, ctx) => {
  for (const administration of findAll(section, 'entry/substanceAdministration')) {
    if (attr(administration, 'negationInd') === 'true') continue;
    const { name = 'Unnamed vaccine', code } = substanceName(administration, ctx);
    const id = ctx.source(administration, 'Immunization', name);
    ctx.builder.record.immunizations.push({
      id: ctx.builder.nextId('imm'),
      sourceId: id,
      codes: codingsOf(code),
      name,
      date: dateOf(child(administration, 'effectiveTime')),
      status: attr(child(administration, 'statusCode'), 'code'),
    });
    addNode(ctx, id, 'immunization', name, 'Immunization');
  }
};

const procedures: SectionHandler = (section, ctx) => {
  for (const entry of elementChildren(section, 'entry')) {
    const procedure = child(entry, 'procedure') ?? child(entry, 'observation') ?? child(entry, 'act');
    if (!procedure) continue;
    const name = codeText(child(procedure, 'code'), ctx.resolve) ?? 'Unnamed procedure';
    const codes = codingsOf(child(procedure, 'code'));
    const id = ctx.source(procedure, 'Procedure', name);
    ctx.builder.record.procedures.push({
      id: ctx.builder.nextId('proc'),
      sourceId: id,
      codes,
      name,
      date: dateOf(child(procedure, 'effectiveTime')),
      status: attr(child(procedure, 'statusCode'), 'code'),
      bodySystem: classifyBodySystem(name, codes),
    });
    addNode(ctx, id, 'procedure', name, 'Procedure');
  }
};

/** Section LOINC codes from the C-CDA templates → handler. Unknown sections become narrative documents. */
export const SECTION_HANDLERS: Record<string, SectionHandler> = {
  '48765-2': allergies,
  '10160-0': medications,
  '10183-2': medications,
  '11450-4': problems,
  '30954-2': measurements('labs'),
  '8716-3': measurements('vitals'),
  '46240-8': encounters,
  '11369-6': immunizations,
  '47519-4': procedures,
};
