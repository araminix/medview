import { compact, num, pick, pickStr, str } from '../shared/access';
import { conceptText } from './access';

const TIMING_CODES: Record<string, string> = {
  QD: 'once daily', BID: 'twice daily', TID: 'three times daily', QID: 'four times daily',
  QOD: 'every other day', QHS: 'at bedtime', AM: 'every morning', PM: 'every evening',
  Q4H: 'every 4 hours', Q6H: 'every 6 hours', Q8H: 'every 8 hours', Q12H: 'every 12 hours',
  WK: 'weekly', MO: 'monthly', PRN: 'as needed',
};

const PERIOD_UNITS: Record<string, [singular: string, adverb: string]> = {
  h: ['hour', 'hourly'], d: ['day', 'daily'], wk: ['week', 'weekly'], mo: ['month', 'monthly'], a: ['year', 'yearly'],
  min: ['minute', 'every minute'], s: ['second', 'every second'],
};

const TIMES = ['', 'once', 'twice', 'three times', 'four times'];

/** "2 per 1 d" → "twice daily"; "1 per 8 h" → "every 8 hours". */
export function describeFrequency(frequency: number | undefined, period: number | undefined, unit: string | undefined): string | undefined {
  const names = unit ? PERIOD_UNITS[unit] : undefined;
  if (!names) return undefined;
  const count = frequency ?? 1;
  const span = period ?? 1;
  if (span === 1) return `${TIMES[count] ?? `${count} times`} ${names[1]}`;
  const every = `every ${span} ${names[0]}s`;
  return count === 1 ? every : `${TIMES[count] ?? `${count} times`} ${every}`;
}

/** Turns a FHIR Dosage into plain English such as "500 mg — twice daily". */
export function describeDosage(dosage: unknown): string | undefined {
  const doseValue = num(pick(dosage, 'doseAndRate.doseQuantity.value')) ?? num(pick(dosage, 'doseQuantity.value'));
  const doseUnit = pickStr(dosage, 'doseAndRate.doseQuantity.unit') ?? pickStr(dosage, 'doseQuantity.unit');
  const dose = doseValue !== undefined ? compact([String(doseValue), doseUnit]).join(' ') : undefined;

  const timingCode = pickStr(dosage, 'timing.code.coding.code')?.toUpperCase();
  const frequency =
    describeFrequency(
      num(pick(dosage, 'timing.repeat.frequency')),
      num(pick(dosage, 'timing.repeat.period')),
      pickStr(dosage, 'timing.repeat.periodUnit'),
    ) ??
    (timingCode ? TIMING_CODES[timingCode] : undefined) ??
    conceptText(pick(dosage, 'timing.code'));

  const asNeeded = pick(dosage, 'asNeededBoolean') === true || pick(dosage, 'asNeeded') === true ? 'as needed' : undefined;
  const structured = compact([dose, frequency, asNeeded]).join(' — ');
  return structured || str(pick(dosage, 'text')) || str(pick(dosage, 'patientInstruction'));
}
