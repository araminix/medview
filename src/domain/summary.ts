import { formatCoding } from './codes';
import { byDateDesc, formatDate } from './dates';
import { isAbnormal } from './labs';
import type { ClinicalRecord, LabItem } from './types';

function labLine(lab: LabItem): string {
  const arrow = lab.flag === 'high' ? ' ↑' : lab.flag === 'low' ? ' ↓' : lab.flag === 'critical' ? ' ‼' : '';
  const range = lab.refText ? ` [ref ${lab.refText}]` : '';
  return `- ${lab.name}: ${lab.valueText}${lab.unit ? ` ${lab.unit}` : ''}${arrow}${range} (${formatDate(lab.date)})`;
}

function section(title: string, lines: string[]): string[] {
  return lines.length ? ['', `## ${title}`, ...lines] : [];
}

/** Plain-text clinical summary, meant to be pasted into a support ticket or an AI assistant. */
export function summarizeRecord(record: ClinicalRecord): string {
  const { patient } = record;
  const who = [patient.name, patient.age !== undefined ? `${patient.age} years` : patient.dob, patient.sex].filter(Boolean).join(', ');
  const labs = [...record.labs].sort(byDateDesc((l) => l.date));
  const lines = [
    '# Clinical summary',
    `Patient: ${who || 'not stated'}`,
    `Source: ${record.meta.summary}`,
    ...section('Allergies', record.allergies.map((a) => `- ${a.substance}${a.reaction ? ` — ${a.reaction}` : ''}${a.severity ? ` (${a.severity})` : ''}`)),
    ...section('Conditions', record.conditions.map((c) => `- ${c.name} (${c.status}${c.onset ? `, since ${formatDate(c.onset)}` : ''})${c.codes[0] ? ` — ${formatCoding({ ...c.codes[0], display: undefined })}` : ''}`)),
    ...section('Medications', record.medications.map((m) => `- ${m.name}${m.dosage ? ` — ${m.dosage}` : ''} (${m.status})`)),
    ...section('Abnormal results', labs.filter((l) => isAbnormal(l.flag)).map(labLine)),
    ...section('Other results', labs.filter((l) => !isAbnormal(l.flag)).map(labLine)),
    ...section('Vital signs', record.vitals.map(labLine)),
    ...section('Visits', record.encounters.map((e) => `- ${formatDate(e.start)}: ${e.title}`)),
    ...section('Immunizations', record.immunizations.map((i) => `- ${i.name} (${formatDate(i.date)})`)),
    ...section('Procedures', record.procedures.map((p) => `- ${p.name} (${formatDate(p.date)})`)),
    '',
    'Generated locally via MedView — verify against the official hospital source.',
  ];
  return lines.join('\n');
}
