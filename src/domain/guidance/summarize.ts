import { byDateDesc } from '../dates';
import { isAbnormal, rangeText } from '../labs';
import type { ClinicalRecord, ConditionItem, LabItem } from '../types';
import { ltr, t, tList } from '@/i18n';
import { OXYGEN_TOPIC, topicKeys, TOPICS, type LabRule, type Topic } from './topics';
import type { Evidence, Finding, PlainSummary, Urgency } from './types';

const URGENCY_ORDER: Urgency[] = ['emergency', 'soon', 'routine'];

function latestByName(items: LabItem[]): LabItem[] {
  const latest = new Map<string, LabItem>();
  for (const item of [...items].sort(byDateDesc((l) => l.date))) {
    if (!latest.has(item.name)) latest.set(item.name, item);
  }
  return [...latest.values()];
}

/** Whether an out-of-range result is above or below its range; undefined when the file does not say. */
function directionOf(lab: LabItem): 'high' | 'low' | undefined {
  if (lab.value !== undefined && lab.refHigh !== undefined && lab.value > lab.refHigh) return 'high';
  if (lab.value !== undefined && lab.refLow !== undefined && lab.value < lab.refLow) return 'low';
  return lab.flag === 'high' || lab.flag === 'low' ? lab.flag : undefined;
}

function describeResult(plain: string, lab: LabItem): Evidence {
  const direction = directionOf(lab);
  const range = lab.refText ?? rangeText(lab.refLow, lab.refHigh);
  const comparison = t(direction === 'high' ? 'evidence.higher' : direction === 'low' ? 'evidence.lower' : 'evidence.outside');
  return {
    label: `${plain}: ${ltr(`${lab.valueText}${lab.unit ? ` ${lab.unit}` : ''}`)}`,
    detail: range ? `${comparison} (${ltr(range)})` : comparison,
    date: lab.date,
  };
}

const isMillimolar = (lab: LabItem) => /mmol/i.test(lab.unit ?? '');
const isGramsPerLitre = (lab: LabItem) => /g\/l$/i.test(lab.unit ?? '');

/**
 * Values that laboratories treat as dangerous whatever the reason. They turn a finding
 * into "seek urgent care" instead of "book a visit". Thresholds are conservative and
 * unit-aware; a result marked critical by the lab itself always counts.
 */
export function redFlag(lab: LabItem): string | undefined {
  const { value: v, name } = lab;
  if (v !== undefined) {
    if (/potassium/i.test(name) && (v >= 6 || v <= 2.5)) return t('redflag.potassium');
    if (/sodium/i.test(name) && (v <= 120 || v >= 160)) return t('redflag.sodium');
    if (/glucose/i.test(name)) {
      const [low, high] = isMillimolar(lab) ? [3, 22.2] : [54, 400];
      if (v <= low) return t('redflag.glucoseLow');
      if (v >= high) return t('redflag.glucoseHigh');
    }
    if (/h[a]?emoglobin(?! a1c)|\bhgb\b/i.test(name) && v <= (isGramsPerLitre(lab) ? 70 : 7)) return t('redflag.hemoglobin');
    if (/egfr|glomerular/i.test(name) && v < 15) return t('redflag.egfr');
    if (/oxygen saturation|spo2/i.test(name) && v <= 90) return t('redflag.oxygen');
  }
  if (/troponin/i.test(name) && isAbnormal(lab.flag)) return t('redflag.troponin');
  if (lab.flag === 'critical') return t('redflag.critical');
  return undefined;
}

interface Draft {
  topic: Topic;
  evidence: Evidence[];
  urgency: Urgency;
  urgentReason?: string;
}

class Drafts {
  private readonly byTopic = new Map<string, Draft>();

  add(topic: Topic, evidence: Evidence, urgency: Urgency, urgentReason?: string): void {
    const draft = this.byTopic.get(topic.id) ?? { topic, evidence: [], urgency: 'routine' as Urgency };
    draft.evidence.push(evidence);
    if (URGENCY_ORDER.indexOf(urgency) < URGENCY_ORDER.indexOf(draft.urgency)) draft.urgency = urgency;
    draft.urgentReason ??= urgentReason;
    this.byTopic.set(topic.id, draft);
  }

  findings(): Finding[] {
    return [...this.byTopic.values()]
      .map(({ topic, evidence, urgency, urgentReason }): Finding => {
        const keys = topicKeys(topic.id);
        return { id: topic.id, title: t(keys.title), meaning: t(keys.meaning), selfCare: tList(keys.selfCare), askDoctor: tList(keys.askDoctor), evidence, urgency, urgentReason };
      })
      .sort((a, b) => URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency));
  }
}

function topicForCondition(condition: ConditionItem): Topic | undefined {
  const icd = condition.codes.find((c) => c.system === 'ICD-10')?.code ?? '';
  return TOPICS.find((t) => (icd && t.codes?.test(icd)) || t.names?.test(condition.name));
}

function ruleForLab(lab: LabItem): { topic: Topic; rule: LabRule } | undefined {
  const direction = directionOf(lab);
  for (const topic of TOPICS) {
    // A critical result whose direction is unknown still belongs to its topic.
    const rule = topic.labs?.find((r) => r.name.test(lab.name) && (direction === undefined || r.direction === direction));
    if (rule) return { topic, rule };
  }
  return undefined;
}

const BLOOD_PRESSURE = TOPICS.find((t) => t.id === 'blood-pressure')!;
const WEIGHT = TOPICS.find((t) => t.id === 'weight')!;

/** Reads the most recent blood pressure, whether stored as "148/94" or as two separate vitals. */
function latestBloodPressure(vitals: LabItem[]): { systolic: number; diastolic: number; date?: string } | undefined {
  const combined = vitals.find((v) => /blood pressure/i.test(v.name) && /^\d+\s*\/\s*\d+$/.test(v.valueText));
  if (combined) {
    const [systolic, diastolic] = combined.valueText.split('/').map(Number);
    return { systolic, diastolic, date: combined.date };
  }
  const systolic = vitals.find((v) => /systolic/i.test(v.name));
  const diastolic = vitals.find((v) => /diastolic/i.test(v.name));
  return systolic?.value !== undefined && diastolic?.value !== undefined ? { systolic: systolic.value, diastolic: diastolic.value, date: systolic.date } : undefined;
}

function readVitals(vitals: LabItem[], drafts: Drafts): void {
  const latest = latestByName(vitals);
  const pressure = latestBloodPressure(latest);
  if (pressure && (pressure.systolic >= 140 || pressure.diastolic >= 90)) {
    const severe = pressure.systolic >= 180 || pressure.diastolic >= 120;
    drafts.add(
      BLOOD_PRESSURE,
      { label: t('evidence.bloodPressure', { value: ltr(`${pressure.systolic}/${pressure.diastolic}`) }), detail: t('evidence.bloodPressureDetail'), date: pressure.date },
      severe ? 'emergency' : 'soon',
      severe ? t('redflag.bloodPressure') : undefined,
    );
  }
  const oxygen = latest.find((v) => /oxygen saturation|spo2/i.test(v.name));
  if (oxygen?.value !== undefined && oxygen.value <= 92) {
    drafts.add(OXYGEN_TOPIC, { label: t('evidence.oxygen', { value: oxygen.valueText }), detail: t('evidence.oxygenDetail'), date: oxygen.date }, redFlag(oxygen) ? 'emergency' : 'soon', redFlag(oxygen));
  }
  const bmi = latest.find((v) => /\bbmi\b|body mass index/i.test(v.name));
  if (bmi?.value !== undefined && bmi.value >= 30) {
    drafts.add(WEIGHT, { label: t('evidence.bmi', { value: bmi.valueText }), detail: t('evidence.bmiDetail'), date: bmi.date }, 'routine');
  }
}

/**
 * Turns a clinical record into a short list of plain-language findings, most urgent first.
 * Only the latest reading of each test is considered, so an old value that has since
 * returned to normal does not raise an alarm.
 */
export function buildPlainSummary(record: ClinicalRecord): PlainSummary {
  const drafts = new Drafts();
  const otherConditions: string[] = [];
  const otherResults: Evidence[] = [];

  for (const condition of record.conditions) {
    if (condition.status === 'inactive') continue;
    const topic = topicForCondition(condition);
    if (topic) drafts.add(topic, { label: t('evidence.diagnosis', { name: condition.name }), date: condition.onset }, 'routine');
    else otherConditions.push(condition.name);
  }

  for (const lab of latestByName(record.labs)) {
    if (!isAbnormal(lab.flag)) continue;
    const match = ruleForLab(lab);
    const reason = redFlag(lab);
    if (match) drafts.add(match.topic, describeResult(t(match.rule.plain), lab), reason ? 'emergency' : 'soon', reason);
    else otherResults.push(describeResult(lab.name, lab));
  }

  readVitals(record.vitals, drafts);

  const findings = drafts.findings();
  const overall = findings[0]?.urgency ?? (otherConditions.length || otherResults.length ? 'routine' : 'clear');
  return { findings, overall, otherConditions, otherResults };
}
