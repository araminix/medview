import { isObj, type Obj } from '../shared/access';
import { bloodTypeOf, DIASTOLIC, healthType, sexOf, SYSTOLIC } from './catalog';
import type { HealthScan, Reading } from './types';

export const SOURCE_TAG_SYSTEM = 'https://araminix.github.io/medview/source';
export const APPLE_HEALTH_TAG = 'apple-health';

const LOINC = 'http://loinc.org';
const CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';
const PATIENT_ID = 'apple-health-me';
/** Daily totals are averaged over this many days, ending at the last day with data. */
const AVERAGE_DAYS = 30;

const kebab = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const round = (value: number) => Math.round(value * 100) / 100;

function observation(key: string, patient: Obj, body: Obj): Obj {
  const type = healthType(key);
  return {
    resourceType: 'Observation',
    id: `apple-${kebab(key)}`,
    status: 'final',
    category: [{ coding: [{ system: CATEGORY, code: type.category }] }],
    code: { ...(type.loinc ? { coding: [{ system: LOINC, code: type.loinc, display: type.name }] } : {}), text: type.name },
    subject: patient,
    ...body,
  };
}

function quantity(key: string, reading: Pick<Reading, 'value' | 'unit'>): Obj {
  const type = healthType(key);
  return { value: round(type.fraction && reading.value <= 1 ? reading.value * 100 : reading.value), unit: type.unit ?? reading.unit };
}

function bloodPressure(scan: HealthScan, patient: Obj): Obj | undefined {
  const systolic = scan.latest.get(SYSTOLIC);
  const diastolic = scan.latest.get(DIASTOLIC);
  if (!systolic || !diastolic) return undefined;
  const component = (key: string, reading: Reading) => ({
    code: { coding: [{ system: LOINC, code: healthType(key).loinc, display: healthType(key).name }] },
    valueQuantity: quantity(key, reading),
  });
  return {
    resourceType: 'Observation',
    id: 'apple-blood-pressure',
    status: 'final',
    category: [{ coding: [{ system: CATEGORY, code: 'vital-signs' }] }],
    code: { coding: [{ system: LOINC, code: '85354-9', display: 'Blood pressure' }], text: 'Blood pressure' },
    subject: patient,
    effectiveDateTime: systolic.date,
    component: [component(SYSTOLIC, systolic), component(DIASTOLIC, diastolic)],
  };
}

/** The daily total is the largest one any single device counted: a phone and a watch both count the same steps. */
function dailyAverage(days: Map<string, Map<string, number>>): { value: number; start: string; end: string } | undefined {
  const totals = [...days.entries()].map(([day, sources]) => [day, Math.max(...sources.values())] as const).sort(([a], [b]) => a.localeCompare(b));
  const recent = totals.slice(-AVERAGE_DAYS);
  if (recent.length === 0) return undefined;
  return { value: recent.reduce((sum, [, total]) => sum + total, 0) / recent.length, start: recent[0][0], end: recent[recent.length - 1][0] };
}

function measurements(scan: HealthScan, patient: Obj): Obj[] {
  const result: Obj[] = [];
  const pressure = bloodPressure(scan, patient);
  if (pressure) result.push(pressure);
  for (const [key, reading] of scan.latest) {
    if (pressure && (key === SYSTOLIC || key === DIASTOLIC)) continue;
    result.push(observation(key, patient, { effectiveDateTime: reading.date, valueQuantity: quantity(key, reading) }));
  }
  for (const [key, series] of scan.daily) {
    const average = dailyAverage(series.days);
    if (average) result.push(observation(key, patient, { effectivePeriod: { start: average.start, end: average.end }, valueQuantity: quantity(key, { value: average.value, unit: series.unit }) }));
  }
  return result;
}

/**
 * Turns a scanned Apple Health export into a FHIR bundle, so the report, the graph, FHIRPath and the
 * scrubber all work on it. Clinical records in the export are already FHIR and are passed through.
 */
export function healthExportToFhir(scan: HealthScan, clinicalRecords: unknown[] = []): Obj {
  const clinical = clinicalRecords.filter(isObj).filter((r) => typeof r.resourceType === 'string');
  const ownPatient = clinical.find((r) => r.resourceType === 'Patient');
  const patientId = typeof ownPatient?.id === 'string' ? ownPatient.id : PATIENT_ID;
  const patient = { reference: `Patient/${patientId}` };
  const me: Obj = { resourceType: 'Patient', id: PATIENT_ID, ...(scan.birthDate ? { birthDate: scan.birthDate.slice(0, 10) } : {}), ...(sexOf(scan.sex) ? { gender: sexOf(scan.sex) } : {}) };
  const bloodType = bloodTypeOf(scan.bloodType);
  const resources: Obj[] = [
    ...(ownPatient ? [] : [me]),
    ...clinical,
    ...measurements(scan, patient),
    ...(bloodType
      ? [{ resourceType: 'Observation', id: 'apple-blood-type', status: 'final', category: [{ coding: [{ system: CATEGORY, code: 'laboratory' }] }], code: { coding: [{ system: LOINC, code: '882-1', display: 'Blood group' }], text: 'Blood group' }, subject: patient, valueString: bloodType }]
      : []),
  ];
  return {
    resourceType: 'Bundle',
    type: 'collection',
    meta: { tag: [{ system: SOURCE_TAG_SYSTEM, code: APPLE_HEALTH_TAG, display: `Converted from an Apple Health export by MedView (${scan.records} readings)` }] },
    ...(scan.exportDate ? { timestamp: scan.exportDate } : {}),
    entry: resources.map((resource) => ({ resource })),
  };
}
