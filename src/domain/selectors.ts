import { classifyMedication } from './bodySystems';
import { byDateDesc } from './dates';
import { isAbnormal } from './labs';
import type { BodySystem, ClinicalRecord, ConditionItem, EncounterItem, LabItem } from './types';

const SEVERITY: Record<string, number> = { critical: 0, high: 1, low: 1, abnormal: 2 };

/** Out-of-range results, most severe and most recent first — only the latest reading of each test. */
export function abnormalLabs(labs: LabItem[]): LabItem[] {
  const latest = new Map<string, LabItem>();
  for (const lab of [...labs].sort(byDateDesc((l) => l.date))) {
    if (!latest.has(lab.name)) latest.set(lab.name, lab);
  }
  return [...latest.values()]
    .filter((lab) => isAbnormal(lab.flag))
    .sort((a, b) => (SEVERITY[a.flag] ?? 9) - (SEVERITY[b.flag] ?? 9));
}

export function activeConditions(conditions: ConditionItem[]): ConditionItem[] {
  return conditions.filter((c) => c.status !== 'inactive');
}

export type ZoneTone = 'none' | 'normal' | 'attention' | 'abnormal';

export interface ZoneSummary {
  count: number;
  tone: ZoneTone;
}

/** What the body map shows per zone: abnormal results beat active conditions beat normal records. */
export function summarizeZones(record: ClinicalRecord): Record<BodySystem, ZoneSummary> {
  const zones = {} as Record<BodySystem, ZoneSummary>;
  const raise = (system: BodySystem, tone: ZoneTone) => {
    const zone = (zones[system] ??= { count: 0, tone: 'none' });
    const rank: ZoneTone[] = ['none', 'normal', 'attention', 'abnormal'];
    zone.count += 1;
    if (rank.indexOf(tone) > rank.indexOf(zone.tone)) zone.tone = tone;
  };
  for (const lab of [...record.labs, ...record.vitals]) raise(lab.bodySystem, isAbnormal(lab.flag) ? 'abnormal' : 'normal');
  for (const condition of record.conditions) raise(condition.bodySystem, condition.status === 'inactive' ? 'normal' : 'attention');
  for (const procedure of record.procedures) raise(procedure.bodySystem, 'normal');
  return zones;
}

/** Narrows the record to one body system. Medications are matched by drug class keywords. */
export function filterBySystem(record: ClinicalRecord, system: BodySystem | undefined): ClinicalRecord {
  if (!system) return record;
  return {
    ...record,
    labs: record.labs.filter((l) => l.bodySystem === system),
    vitals: record.vitals.filter((v) => v.bodySystem === system),
    conditions: record.conditions.filter((c) => c.bodySystem === system),
    procedures: record.procedures.filter((p) => p.bodySystem === system),
    medications: record.medications.filter((m) => classifyMedication(m.name) === system),
  };
}

export interface TimelineEvent {
  id: string;
  date?: string;
  kind: 'visit' | 'hospital' | 'procedure' | 'immunization' | 'labs';
  title: string;
  detail?: string;
  sourceId?: string;
}

function encounterKind(encounter: EncounterItem): TimelineEvent['kind'] {
  return /hospital|emergency/i.test(encounter.kind) ? 'hospital' : 'visit';
}

/** One date-sorted stream of visits, procedures, immunizations and the days labs were drawn. */
export function buildTimeline(record: ClinicalRecord): TimelineEvent[] {
  const labDays = new Map<string, LabItem[]>();
  for (const lab of record.labs) {
    const day = lab.date?.slice(0, 10);
    if (day) labDays.set(day, [...(labDays.get(day) ?? []), lab]);
  }
  const events: TimelineEvent[] = [
    ...record.encounters.map((e) => ({
      id: e.id,
      date: e.start,
      kind: encounterKind(e),
      title: e.title,
      detail: [e.kind !== e.title ? e.kind : undefined, e.location, e.provider, e.reason].filter(Boolean).join(' · ') || undefined,
      sourceId: e.sourceId,
    })),
    ...record.procedures.map((p) => ({ id: p.id, date: p.date, kind: 'procedure' as const, title: p.name, detail: 'Procedure', sourceId: p.sourceId })),
    ...record.immunizations.map((i) => ({ id: i.id, date: i.date, kind: 'immunization' as const, title: i.name, detail: 'Immunization', sourceId: i.sourceId })),
    ...[...labDays].map(([day, labs]) => {
      const abnormal = labs.filter((l) => isAbnormal(l.flag)).length;
      return {
        id: `labs-${day}`,
        date: day,
        kind: 'labs' as const,
        title: `${labs.length} lab result${labs.length === 1 ? '' : 's'}`,
        detail: abnormal ? `${abnormal} outside the reference range` : 'All within range',
      };
    }),
  ];
  return events.sort(byDateDesc((e) => e.date));
}

export interface SectionLink {
  id: string;
  label: string;
  count?: number;
}

/** Sidebar jump links with item counts; empty sections are left out. */
export function sectionLinks(record: ClinicalRecord): SectionLink[] {
  const links: SectionLink[] = [
    { id: 'overview', label: 'Overview & Abnormal Flags' },
    { id: 'labs', label: 'Labs & Biomarkers', count: record.labs.length },
    { id: 'medications', label: 'Medications', count: record.medications.length },
    { id: 'conditions', label: 'Conditions / Diagnoses', count: record.conditions.length },
    { id: 'vitals', label: 'Vitals', count: record.vitals.length },
    { id: 'timeline', label: 'Visits / Timeline', count: record.encounters.length },
    { id: 'immunizations', label: 'Immunizations & Procedures', count: record.immunizations.length + record.procedures.length },
    { id: 'notes', label: 'Notes & Documents', count: record.documents.length },
    { id: 'warnings', label: 'Parse Warnings', count: record.meta.warnings.length },
  ];
  return links.filter((link) => link.count === undefined || link.count > 0);
}
