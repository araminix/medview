import { t, type MessageKey } from '@/i18n';

/** What common medicines are generally used for, in everyday words. Purely explanatory. */
const PURPOSES: Array<[RegExp, MessageKey]> = [
  [/metformin|gliptin|gliflozin|glutide|glipizide|glimepiride|gliclazide|pioglitazone/i, 'purpose.sugar'],
  [/insulin/i, 'purpose.insulin'],
  [/statin\b/i, 'purpose.cholesterol'],
  [/pril\b|sartan\b|dipine\b|hydrochlorothiazide|chlorthalidone/i, 'purpose.pressure'],
  [/olol\b/i, 'purpose.betaBlocker'],
  [/furosemide|torsemide|bumetanide|spironolactone/i, 'purpose.diuretic'],
  [/warfarin|apixaban|rivaroxaban|dabigatran|edoxaban/i, 'purpose.anticoagulant'],
  [/aspirin|clopidogrel/i, 'purpose.antiplatelet'],
  [/prazole\b|famotidine|ranitidine/i, 'purpose.acid'],
  [/levothyroxine/i, 'purpose.thyroid'],
  [/albuterol|salbutamol|salmeterol|formoterol|tiotropium|budesonide|fluticasone/i, 'purpose.airways'],
  [/amoxicillin|azithromycin|cillin\b|cycline\b|floxacin\b|cephalexin/i, 'purpose.antibiotic'],
  [/ibuprofen|naproxen|diclofenac|celecoxib/i, 'purpose.antiInflammatory'],
  [/paracetamol|acetaminophen/i, 'purpose.painFever'],
  [/sertraline|fluoxetine|escitalopram|citalopram/i, 'purpose.mood'],
  [/ferrous|iron\b/i, 'purpose.iron'],
  [/allopurinol/i, 'purpose.gout'],
];

export function medicinePurpose(name: string): string | undefined {
  const key = PURPOSES.find(([pattern]) => pattern.test(name))?.[1];
  return key ? t(key) : undefined;
}
