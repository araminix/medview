import type { ListKey, MessageKey } from '@/i18n';

export type TopicId =
  | 'heart-attack-marker'
  | 'potassium'
  | 'blood-sugar'
  | 'low-blood-sugar'
  | 'blood-pressure'
  | 'cholesterol'
  | 'kidneys'
  | 'heart-failure'
  | 'heart-rhythm'
  | 'anemia'
  | 'sodium'
  | 'liver'
  | 'thyroid'
  | 'weight'
  | 'breathing'
  | 'joints'
  | 'reflux'
  | 'infection-marker'
  | 'oxygen';

export interface LabRule {
  /** Matches the test name. */
  name: RegExp;
  direction: 'high' | 'low';
  /** Dictionary key of the everyday name shown to the reader. */
  plain: Extract<MessageKey, `lab.${string}`>;
}

/**
 * How a topic is recognized in a record. Its wording — title, meaning, self-care habits and
 * questions for the doctor — lives in the dictionaries under `topic.<id>.*`, one set per language.
 */
export interface Topic {
  id: TopicId;
  /** ICD-10 code prefixes, e.g. /^E1[0-4]/. */
  codes?: RegExp;
  /** Condition names, for files without ICD-10 codes. */
  names?: RegExp;
  labs?: LabRule[];
}

export const topicKeys = (id: TopicId) => ({
  title: `topic.${id}.title` as MessageKey,
  meaning: `topic.${id}.meaning` as MessageKey,
  selfCare: `topic.${id}.selfCare` as ListKey,
  askDoctor: `topic.${id}.askDoctor` as ListKey,
});

/** Ordered: when a result could belong to two topics, the first one wins. */
export const TOPICS: Topic[] = [
  {
    id: 'heart-attack-marker',
    labs: [
      { name: /troponin/i, direction: 'high', plain: 'lab.troponin' },
    ],
  },
  {
    id: 'potassium',
    labs: [
      { name: /potassium/i, direction: 'high', plain: 'lab.potassium' },
      { name: /potassium/i, direction: 'low', plain: 'lab.potassium' },
    ],
  },
  {
    id: 'blood-sugar',
    codes: /^E1[0-4]/,
    names: /diabet/i,
    labs: [
      { name: /hba1c|a1c|glyc(at|osylat)ed/i, direction: 'high', plain: 'lab.hba1c' },
      { name: /glucose/i, direction: 'high', plain: 'lab.glucose' },
    ],
  },
  {
    id: 'low-blood-sugar',
    labs: [
      { name: /glucose/i, direction: 'low', plain: 'lab.glucose' },
    ],
  },
  {
    id: 'blood-pressure',
    codes: /^I1[0-5]/,
    names: /hypertens|high blood pressure/i,
  },
  {
    id: 'cholesterol',
    codes: /^E78/,
    names: /hyperlipid|cholesterol|dyslipid/i,
    labs: [
      { name: /\bldl/i, direction: 'high', plain: 'lab.ldl' },
      { name: /cholesterol.*total|total.*cholesterol|^cholesterol$/i, direction: 'high', plain: 'lab.totalCholesterol' },
      { name: /triglycerid/i, direction: 'high', plain: 'lab.triglycerides' },
      { name: /\bhdl/i, direction: 'low', plain: 'lab.hdl' },
    ],
  },
  {
    id: 'kidneys',
    codes: /^N1[7-9]/,
    names: /kidney disease|renal (failure|insufficiency)/i,
    labs: [
      { name: /creatinine/i, direction: 'high', plain: 'lab.creatinine' },
      { name: /egfr|gfr|glomerular/i, direction: 'low', plain: 'lab.egfr' },
    ],
  },
  {
    id: 'heart-failure',
    codes: /^I50/,
    names: /heart failure/i,
    labs: [
      { name: /bnp/i, direction: 'high', plain: 'lab.bnp' },
    ],
  },
  {
    id: 'heart-rhythm',
    codes: /^I48/,
    names: /atrial fibrillation|atrial flutter/i,
  },
  {
    id: 'anemia',
    codes: /^D(5\d|6[0-4])/,
    names: /an[a]?emia/i,
    labs: [
      { name: /hemoglobin(?! a1c)|haemoglobin(?! a1c)|\bhgb\b/i, direction: 'low', plain: 'lab.hemoglobin' },
      { name: /hematocrit|haematocrit/i, direction: 'low', plain: 'lab.hematocrit' },
      { name: /ferritin/i, direction: 'low', plain: 'lab.ferritin' },
    ],
  },
  {
    id: 'sodium',
    labs: [
      { name: /sodium/i, direction: 'low', plain: 'lab.sodium' },
    ],
  },
  {
    id: 'liver',
    codes: /^K7[0-7]/,
    names: /hepatitis|cirrhosis|fatty liver|liver disease/i,
    labs: [
      { name: /\balt\b|alanine/i, direction: 'high', plain: 'lab.alt' },
      { name: /\bast\b|aspartate/i, direction: 'high', plain: 'lab.ast' },
      { name: /bilirubin/i, direction: 'high', plain: 'lab.bilirubin' },
      { name: /\bggt\b|alkaline phosphatase/i, direction: 'high', plain: 'lab.liverEnzyme' },
    ],
  },
  {
    id: 'thyroid',
    codes: /^E0[0-7]/,
    names: /thyroid/i,
    labs: [
      { name: /\btsh\b|thyrotropin/i, direction: 'high', plain: 'lab.tsh' },
      { name: /\btsh\b|thyrotropin/i, direction: 'low', plain: 'lab.tsh' },
    ],
  },
  {
    id: 'weight',
    codes: /^E66/,
    names: /obes/i,
  },
  {
    id: 'breathing',
    codes: /^J4[0-7]/,
    names: /asthma|copd|chronic obstructive|emphysema|chronic bronchitis/i,
  },
  {
    id: 'joints',
    codes: /^M1[5-9]/,
    names: /osteoarthritis|arthrosis/i,
  },
  {
    id: 'reflux',
    codes: /^K21/,
    names: /reflux|gerd/i,
  },
  {
    id: 'infection-marker',
    labs: [
      { name: /\bwbc\b|leu[ck]ocyte|white blood/i, direction: 'high', plain: 'lab.wbc' },
    ],
  },
];

/** Raised from vital signs rather than from a lab rule or a diagnosis. */
export const OXYGEN_TOPIC: Topic = { id: 'oxygen' };
