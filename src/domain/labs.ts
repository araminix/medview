import type { Coding, LabFlag } from './types';

export interface RefRange {
  low?: number;
  high?: number;
  text?: string;
}

const NUMBER = String.raw`[-+]?\d+(?:[.,]\d+)?`;

function toNumber(text: string): number {
  return Number(text.replace(',', '.'));
}

/** Parses "3.5-5.0", "3.5 – 5.0", "<200", "<=5.6", ">60", ">= 60". */
export function parseRefRange(input: string | undefined): RefRange {
  const text = input?.trim();
  if (!text) return {};
  const between = new RegExp(`^(${NUMBER})\\s*(?:-|–|—|to)\\s*(${NUMBER})`, 'i').exec(text);
  if (between) return { low: toNumber(between[1]), high: toNumber(between[2]), text };
  const bound = new RegExp(`^([<>])=?\\s*(${NUMBER})`).exec(text);
  if (bound) return bound[1] === '<' ? { high: toNumber(bound[2]), text } : { low: toNumber(bound[2]), text };
  return { text };
}

/** Display text for numeric bounds: "3.5 – 5.1", "> 60", "< 200". */
export function rangeText(low: number | string | undefined, high: number | string | undefined): string | undefined {
  if (low !== undefined && high !== undefined) return `${low} – ${high}`;
  if (low !== undefined) return `> ${low}`;
  return high !== undefined ? `< ${high}` : undefined;
}

/** Numeric reading of a result. "<0.01" → 0.01, "Positive" → undefined. */
export function parseNumeric(input: unknown): number | undefined {
  if (typeof input === 'number') return Number.isFinite(input) ? input : undefined;
  if (typeof input !== 'string') return undefined;
  const match = new RegExp(`^\\s*[<>]?=?\\s*(${NUMBER})\\s*$`).exec(input);
  return match ? toNumber(match[1]) : undefined;
}

/** HL7 v2 table 0078 / FHIR v3-ObservationInterpretation codes. */
export function flagFromCode(code: string | undefined): LabFlag | undefined {
  switch (code?.trim().toUpperCase()) {
    case 'H':
    case 'HU':
    case '>':
      return 'high';
    case 'L':
    case 'LU':
    case '<':
      return 'low';
    case 'HH':
    case 'LL':
    case 'AA':
    case 'PANIC':
    case 'CRITICAL':
      return 'critical';
    case 'A':
    case 'POS':
    case 'DET':
    case 'R':
      return 'abnormal';
    case 'N':
    case 'NEG':
    case 'ND':
    case 'S':
      return 'normal';
    default:
      return undefined;
  }
}

/** An explicit interpretation code wins; otherwise the value is compared with the reference range. */
export function deriveFlag(value: number | undefined, range: RefRange, code?: string): LabFlag {
  const coded = flagFromCode(code);
  if (coded) return coded;
  if (value === undefined || (range.low === undefined && range.high === undefined)) return 'unknown';
  if (range.low !== undefined && value < range.low) return 'low';
  if (range.high !== undefined && value > range.high) return 'high';
  return 'normal';
}

export function isAbnormal(flag: LabFlag): boolean {
  return flag === 'low' || flag === 'high' || flag === 'critical' || flag === 'abnormal';
}

const PANELS: Array<[panel: string, pattern: RegExp]> = [
  ['Diabetes', /\b(hba1c|a1c|glyc(at|osylat)ed)/i],
  ['Iron Studies', /\b(ferritin|iron\b|transferrin|tibc)/i],
  ['Complete Blood Count', /\b(hemoglobin|haemoglobin|hgb|hematocrit|haematocrit|wbc|rbc|leu[ck]ocyte|erythrocyte|platelet|neutrophil|lymphocyte|monocyte|eosinophil|basophil|mcv|mch|mchc|rdw)/i],
  ['Lipid Panel', /\b(cholesterol|ldl|hdl|triglycerid)/i],
  ['Liver Function', /\b(alt\b|ast\b|alanine|aspartate|bilirubin|alkaline phosphatase|ggt|albumin\b)/i],
  ['Metabolic Panel', /\b(glucose|sodium|potassium|chloride|bicarbonate|co2|carbon dioxide|calcium|creatinine|urea|bun\b|egfr|gfr|glomerular|magnesium|phosphate|anion gap)/i],
  ['Thyroid', /\b(tsh|thyroid|thyroxine|\bt[34]\b)/i],
  ['Cardiac Markers', /(troponin|bnp\b|ck-mb)/i],
  ['Coagulation', /\b(inr\b|prothrombin|aptt|ptt\b)/i],
  ['Urinalysis', /\b(urin|albumin\/creatinine)/i],
];

/** Groups a lab under a display panel, preferring the panel the file itself reported. */
export function classifyPanel(name: string, reportedPanel?: string, codes: Coding[] = []): string {
  const text = [name, ...codes.map((c) => c.display)].filter(Boolean).join(' ');
  return PANELS.find(([, pattern]) => pattern.test(text))?.[0] ?? reportedPanel?.trim() ?? 'Other Results';
}

/** LOINC codes and names that are vital signs rather than laboratory results. */
const VITAL_LOINC = new Set(['8480-6', '8462-4', '85354-9', '8867-4', '9279-1', '8310-5', '29463-7', '8302-2', '39156-5', '2708-6', '59408-5', '3141-9', '8306-3', '8287-5']);
const VITAL_NAME = /\b(blood pressure|systolic|diastolic|heart rate|pulse\b|respiratory rate|body temperature|temperature|body weight|weight\b|body height|height\b|bmi|body mass index|oxygen saturation|spo2)/i;

export function isVitalSign(name: string, codes: Coding[], category?: string): boolean {
  if (category && /vital/i.test(category)) return true;
  if (category && /lab/i.test(category)) return false;
  return codes.some((c) => c.system === 'LOINC' && VITAL_LOINC.has(c.code)) || VITAL_NAME.test(name);
}
