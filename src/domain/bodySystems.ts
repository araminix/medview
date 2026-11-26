import type { BodySystem, Coding } from './types';

/** The eight body-map zones plus the catch-all, in display order. Labels live in the dictionaries. */
export const BODY_SYSTEMS: BodySystem[] = ['neuro', 'cardio', 'respiratory', 'gi', 'renal', 'blood', 'endocrine', 'musculoskeletal', 'general'];

/** ICD-10 chapter ranges → body zone. D50–D89 is the only sub-chapter split we need. */
function fromIcd10(code: string): BodySystem | undefined {
  const match = /^([A-Z])(\d{2})/.exec(code.toUpperCase());
  if (!match) return undefined;
  const [, letter, digits] = match;
  const n = Number(digits);
  switch (letter) {
    case 'I':
      return 'cardio';
    case 'J':
      return 'respiratory';
    case 'K':
      return 'gi';
    case 'N':
      return 'renal';
    case 'G':
      return 'neuro';
    case 'M':
      return 'musculoskeletal';
    case 'E':
      return n <= 89 ? 'endocrine' : undefined;
    case 'D':
      return n >= 50 && n <= 89 ? 'blood' : undefined;
    default:
      return undefined;
  }
}

/** Common LOINC lab codes. Anything not listed falls back to the keyword dictionary. */
const LOINC: Record<string, BodySystem> = {
  // Blood count
  '718-7': 'blood', '4544-3': 'blood', '6690-2': 'blood', '789-8': 'blood', '777-3': 'blood', '787-2': 'blood',
  '785-6': 'blood', '786-4': 'blood', '788-0': 'blood', '26515-7': 'blood', '5902-2': 'blood', '6301-6': 'blood', '2276-4': 'blood',
  // Liver
  '1742-6': 'gi', '1920-8': 'gi', '1975-2': 'gi', '6768-6': 'gi', '1751-7': 'gi', '2324-2': 'gi', '1968-7': 'gi',
  // Kidney
  '2160-0': 'renal', '33914-3': 'renal', '48642-3': 'renal', '48643-1': 'renal', '62238-1': 'renal', '98979-8': 'renal',
  '3094-0': 'renal', '6299-2': 'renal', '14959-1': 'renal', '9318-7': 'renal',
  // Heart
  '10839-9': 'cardio', '6598-7': 'cardio', '89579-7': 'cardio', '30934-4': 'cardio', '33762-6': 'cardio', '2089-1': 'cardio',
  '13457-7': 'cardio', '18262-6': 'cardio', '2085-9': 'cardio', '2093-3': 'cardio', '2571-8': 'cardio',
  '8480-6': 'cardio', '8462-4': 'cardio', '85354-9': 'cardio', '8867-4': 'cardio',
  // Endocrine / metabolic
  '4548-4': 'endocrine', '17856-6': 'endocrine', '2345-7': 'endocrine', '2339-0': 'endocrine', '1558-6': 'endocrine',
  '3016-3': 'endocrine', '11580-8': 'endocrine', '3024-7': 'endocrine', '3053-6': 'endocrine', '39156-5': 'endocrine',
  // Respiratory
  '2708-6': 'respiratory', '59408-5': 'respiratory', '9279-1': 'respiratory', '19868-9': 'respiratory', '20150-9': 'respiratory',
};

/** Ordered: the first matching entry wins, so specific terms come before broad ones. */
const KEYWORDS: Array<[BodySystem, RegExp]> = [
  ['endocrine', /\b(hba1c|a1c|glyc(at|osylat)ed|glucose|diabet|insulin|thyroid|tsh|thyroxine|\bt[34]\b|hypothyroid|hyperthyroid|cortisol|obes|body mass|bmi|metabolic|hyperlipid|dyslipid|vitamin d)/i],
  ['renal', /\b(creatinine|egfr|gfr|glomerular|kidney|renal|nephr|urea|bun\b|albuminuria|microalbumin|urin|dialysis|cystitis|bladder)/i],
  ['gi', /\b(alt\b|ast\b|sgpt|sgot|alanine|aspartate|bilirubin|alkaline phosphatase|ggt|liver|hepat|cirrhosis|gastr|reflux|gerd|colitis|crohn|bowel|pancrea|lipase|amylase|colon|esophag|cholecyst|gallbladder)/i],
  ['cardio', /\b(troponin|bnp|ldl|hdl|cholesterol|triglycerid|blood pressure|systolic|diastolic|heart|cardi|coronary|hypertens|atrial|fibrillation|myocard|angina|infarct|heart rate|pulse\b|ecg|ekg|statin|vascular|aortic)/i],
  ['respiratory', /\b(lung|pulmon|respirat|asthma|copd|bronch|pneumon|oxygen saturation|spo2|fev1|fvc|spirometr|dyspn|emphysema|apnea)/i],
  ['blood', /\b(hemoglobin|haemoglobin|hgb|hematocrit|haematocrit|wbc|rbc|leu[ck]ocyte|erythrocyte|platelet|neutrophil|lymphocyte|monocyte|eosinophil|basophil|mcv|mch|mchc|rdw|ferritin|iron|an[a]?emia|inr\b|prothrombin|coagul|cbc|blood count|transferrin|b12|folate)/i],
  ['neuro', /\b(brain|neuro|cerebr|stroke|seizure|epilep|migraine|headache|dementia|alzheimer|parkinson|sclerosis|neuropath|concussion|depress|anxiety|cognitive)/i],
  ['musculoskeletal', /\b(arthr|osteo|bone|joint|fracture|muscul|spine|spinal|lumbar|back pain|knee|hip\b|shoulder|tendon|ligament|gout|scoliosis|fibromyalgia|sprain)/i],
];

/** Common drug names and classes, so medications can follow the body-map filter. */
const DRUGS: Array<[BodySystem, RegExp]> = [
  ['endocrine', /(metformin|insulin|gliptin|gliflozin|glutide|glipizide|glimepiride|levothyroxine|pioglitazone)/i],
  ['cardio', /(statin\b|pril\b|sartan\b|olol\b|dipine\b|aspirin|clopidogrel|warfarin|apixaban|rivaroxaban|furosemide|spironolactone|hydrochlorothiazide|digoxin|amiodarone|nitroglycerin)/i],
  ['respiratory', /(albuterol|salbutamol|budesonide|fluticasone|montelukast|tiotropium|salmeterol|formoterol)/i],
  ['gi', /(prazole\b|ranitidine|famotidine|ondansetron|lactulose|mesalamine|loperamide)/i],
  ['neuro', /(sertraline|fluoxetine|escitalopram|citalopram|gabapentin|pregabalin|levetiracetam|sumatriptan|donepezil|levodopa|amitriptyline)/i],
  ['musculoskeletal', /(ibuprofen|naproxen|diclofenac|celecoxib|allopurinol|alendronate|methotrexate|colchicine)/i],
  ['blood', /(ferrous|iron\b|epoetin|folic acid|cyanocobalamin)/i],
];

export function classifyMedication(name: string): BodySystem {
  return DRUGS.find(([, pattern]) => pattern.test(name))?.[0] ?? 'general';
}

/** Maps a coded clinical item to one of the 8 body zones; unmapped items stay under General. */
export function classifyBodySystem(name: string | undefined, codes: Coding[] = []): BodySystem {
  for (const coding of codes) {
    if (coding.system === 'ICD-10') {
      const system = fromIcd10(coding.code);
      if (system) return system;
    }
    if (coding.system === 'LOINC' && LOINC[coding.code]) return LOINC[coding.code];
  }
  const text = [name, ...codes.map((c) => c.display)].filter(Boolean).join(' ');
  for (const [system, pattern] of KEYWORDS) if (pattern.test(text)) return system;
  return 'general';
}
