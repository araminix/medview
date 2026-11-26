// Generates the synthetic Apple Health export sample. The person and every reading here are invented.
// Run: node scripts/build-apple-health-sample.mjs
import { writeFileSync } from 'node:fs';

const PHONE = 'Maya’s iPhone';
const WATCH = 'Maya’s Apple Watch';
const pad = (n) => String(n).padStart(2, '0');
const day = (offset) => {
  const date = new Date(Date.UTC(2025, 8, 30 - offset));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};
const record = (type, source, unit, date, time, value) =>
  ` <Record type="HKQuantityTypeIdentifier${type}" sourceName="${source}" unit="${unit}" creationDate="${date} ${time} +0200" startDate="${date} ${time} +0200" endDate="${date} ${time} +0200" value="${value}"/>`;

// A fixed pattern instead of random numbers, so the file is the same on every run.
const wave = (i, base, swing) => Math.round(base + swing * Math.sin(i * 1.7) + (swing / 2) * Math.cos(i * 0.6));

const lines = [];
for (let i = 44; i >= 0; i -= 1) {
  const date = day(i);
  const steps = wave(i, 6400, 2100);
  // The watch and the phone both count the same walk; the watch sees a little more of it.
  lines.push(record('StepCount', PHONE, 'count', date, '21:30:00', Math.round(steps * 0.82)));
  lines.push(record('StepCount', WATCH, 'count', date, '21:31:00', steps));
  lines.push(record('DistanceWalkingRunning', WATCH, 'km', date, '21:31:00', (steps * 0.00072).toFixed(2)));
  lines.push(record('ActiveEnergyBurned', WATCH, 'kcal', date, '21:31:00', wave(i, 410, 120)));
  lines.push(record('AppleExerciseTime', WATCH, 'min', date, '21:31:00', wave(i, 24, 14)));
  lines.push(record('RestingHeartRate', WATCH, 'count/min', date, '06:45:00', wave(i, 61, 3)));
  lines.push(record('HeartRate', WATCH, 'count/min', date, '13:10:00', wave(i, 78, 9)));
  if (i % 7 === 0) lines.push(record('BodyMass', 'Smart Scale', 'kg', date, '07:05:00', (71.8 - i * 0.03).toFixed(1)));
  if (i % 9 === 0) {
    lines.push(record('BloodPressureSystolic', 'Pressure Cuff', 'mmHg', date, '07:15:00', wave(i, 136, 5)));
    lines.push(record('BloodPressureDiastolic', 'Pressure Cuff', 'mmHg', date, '07:15:00', wave(i, 87, 3)));
  }
}
lines.push(record('Height', PHONE, 'cm', day(400), '10:00:00', 168));
lines.push(record('BodyMassIndex', 'Smart Scale', 'count', day(0), '07:05:00', 25.4));
lines.push(record('OxygenSaturation', WATCH, '%', day(0), '03:20:00', 0.96));
lines.push(record('RespiratoryRate', WATCH, 'count/min', day(0), '03:20:00', 14.5));
lines.push(record('HeartRateVariabilitySDNN', WATCH, 'ms', day(0), '03:25:00', 48));
lines.push(record('VO2Max', WATCH, 'mL/min·kg', day(2), '18:40:00', 34.2));
lines.push(` <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="${WATCH}" creationDate="${day(0)} 07:00:00 +0200" startDate="${day(1)} 23:10:00 +0200" endDate="${day(0)} 06:40:00 +0200" value="HKCategoryValueSleepAnalysisAsleepCore"/>`);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ELEMENT HealthData (ExportDate,Me,(Record|Workout|ActivitySummary|ClinicalRecord)*)>
<!ATTLIST HealthData locale CDATA #REQUIRED>
]>
<HealthData locale="en_NL">
 <ExportDate value="${day(0)} 22:04:11 +0200"/>
 <Me HKCharacteristicTypeIdentifierDateOfBirth="1988-04-22" HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexFemale" HKCharacteristicTypeIdentifierBloodType="HKBloodTypeOPositive" HKCharacteristicTypeIdentifierFitzpatrickSkinType="HKFitzpatrickSkinTypeNotSet"/>
${lines.join('\n')}
</HealthData>
`;
writeFileSync(new URL('../src/samples/apple-health-export.xml', import.meta.url), xml);
