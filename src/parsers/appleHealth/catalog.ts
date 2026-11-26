import type { HealthType } from './types';

const PREFIX = 'HKQuantityTypeIdentifier';

/** The Apple Health measurements shown in the report. Other types are counted but left out. */
const TYPES: Record<string, HealthType> = {
  HeartRate: { name: 'Heart rate', loinc: '8867-4', reduce: 'latest', category: 'vital-signs', unit: 'bpm' },
  RestingHeartRate: { name: 'Resting heart rate', loinc: '40443-4', reduce: 'latest', category: 'vital-signs', unit: 'bpm' },
  WalkingHeartRateAverage: { name: 'Walking heart rate average', reduce: 'latest', category: 'vital-signs', unit: 'bpm' },
  HeartRateVariabilitySDNN: { name: 'Heart rate variability (SDNN)', loinc: '80404-7', reduce: 'latest', category: 'vital-signs' },
  BloodPressureSystolic: { name: 'Systolic blood pressure', loinc: '8480-6', reduce: 'latest', category: 'vital-signs' },
  BloodPressureDiastolic: { name: 'Diastolic blood pressure', loinc: '8462-4', reduce: 'latest', category: 'vital-signs' },
  OxygenSaturation: { name: 'Oxygen saturation', loinc: '59408-5', reduce: 'latest', category: 'vital-signs', unit: '%', fraction: true },
  RespiratoryRate: { name: 'Respiratory rate', loinc: '9279-1', reduce: 'latest', category: 'vital-signs', unit: 'breaths/min' },
  BodyTemperature: { name: 'Body temperature', loinc: '8310-5', reduce: 'latest', category: 'vital-signs' },
  BodyMass: { name: 'Body weight', loinc: '29463-7', reduce: 'latest', category: 'vital-signs' },
  Height: { name: 'Body height', loinc: '8302-2', reduce: 'latest', category: 'vital-signs' },
  BodyMassIndex: { name: 'Body mass index (BMI)', loinc: '39156-5', reduce: 'latest', category: 'vital-signs', unit: 'kg/m2' },
  BodyFatPercentage: { name: 'Body fat percentage', loinc: '41982-0', reduce: 'latest', category: 'vital-signs', unit: '%', fraction: true },
  VO2Max: { name: 'Cardio fitness (VO2 max)', reduce: 'latest', category: 'vital-signs' },
  BloodGlucose: { name: 'Glucose', loinc: '2339-0', reduce: 'latest', category: 'laboratory' },
  StepCount: { name: 'Steps per day', loinc: '55423-8', reduce: 'daily', category: 'activity', unit: 'steps' },
  DistanceWalkingRunning: { name: 'Walking and running distance per day', reduce: 'daily', category: 'activity' },
  ActiveEnergyBurned: { name: 'Active energy per day', reduce: 'daily', category: 'activity' },
  FlightsClimbed: { name: 'Flights climbed per day', reduce: 'daily', category: 'activity', unit: 'flights' },
  AppleExerciseTime: { name: 'Exercise minutes per day', reduce: 'daily', category: 'activity' },
};

export const SYSTOLIC = 'BloodPressureSystolic';
export const DIASTOLIC = 'BloodPressureDiastolic';

/** The catalog key of an export type ("HKQuantityTypeIdentifierHeartRate" → "HeartRate"), when it is one we show. */
export function healthKey(type: string | undefined): string | undefined {
  if (!type?.startsWith(PREFIX)) return undefined;
  const key = type.slice(PREFIX.length);
  return key in TYPES ? key : undefined;
}

export function healthType(key: string): HealthType {
  return TYPES[key];
}

const SEX: Record<string, string> = { HKBiologicalSexMale: 'male', HKBiologicalSexFemale: 'female', HKBiologicalSexOther: 'other' };
const BLOOD_TYPE = /^HKBloodType(AB|A|B|O)(Positive|Negative)$/;

export function sexOf(value: string | undefined): string | undefined {
  return value ? SEX[value] : undefined;
}

/** "HKBloodTypeAPositive" → "A+". */
export function bloodTypeOf(value: string | undefined): string | undefined {
  const match = BLOOD_TYPE.exec(value ?? '');
  return match ? `${match[1]}${match[2] === 'Positive' ? '+' : '-'}` : undefined;
}
