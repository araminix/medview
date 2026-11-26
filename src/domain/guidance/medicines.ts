/** What common medicines are generally used for, in everyday words. Purely explanatory. */
const PURPOSES: Array<[RegExp, string]> = [
  [/metformin|gliptin|gliflozin|glutide|glipizide|glimepiride|gliclazide|pioglitazone/i, 'helps lower blood sugar'],
  [/insulin/i, 'lowers blood sugar'],
  [/statin\b/i, 'lowers cholesterol'],
  [/pril\b|sartan\b|dipine\b|hydrochlorothiazide|chlorthalidone/i, 'lowers blood pressure'],
  [/olol\b/i, 'slows the heart and lowers blood pressure'],
  [/furosemide|torsemide|bumetanide|spironolactone/i, 'a "water tablet" that removes extra fluid'],
  [/warfarin|apixaban|rivaroxaban|dabigatran|edoxaban/i, 'a blood thinner that prevents clots'],
  [/aspirin|clopidogrel/i, 'helps prevent blood clots'],
  [/prazole\b|famotidine|ranitidine/i, 'reduces stomach acid'],
  [/levothyroxine/i, 'replaces thyroid hormone'],
  [/albuterol|salbutamol|salmeterol|formoterol|tiotropium|budesonide|fluticasone/i, 'opens the airways and eases breathing'],
  [/amoxicillin|azithromycin|cillin\b|cycline\b|floxacin\b|cephalexin/i, 'an antibiotic that treats bacterial infections'],
  [/ibuprofen|naproxen|diclofenac|celecoxib/i, 'eases pain and inflammation'],
  [/paracetamol|acetaminophen/i, 'eases pain and fever'],
  [/sertraline|fluoxetine|escitalopram|citalopram/i, 'treats low mood and anxiety'],
  [/ferrous|iron\b/i, 'builds up iron'],
  [/allopurinol/i, 'prevents gout attacks'],
];

export function medicinePurpose(name: string): string | undefined {
  return PURPOSES.find(([pattern]) => pattern.test(name))?.[1];
}
