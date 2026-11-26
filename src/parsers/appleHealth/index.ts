import { decodeChunks, scanHealthExport } from './scan';
import { healthExportToFhir } from './toFhir';

export { APPLE_HEALTH_TAG, SOURCE_TAG_SYSTEM } from './toFhir';

/** The root element of an Apple Health export, looked for near the start of the file only. */
export function isHealthExport(head: string): boolean {
  return /<HealthData[\s>]/.test(head.slice(0, 20000));
}

/** Path inside the zip of a clinical record the export refers to ("/clinical-records/x.json"). */
export const CLINICAL_RECORD = /(^|\/)clinical-records\/[^/]+\.json$/i;

/** Converts an export.xml (as text pieces or bytes) and its FHIR clinical records to FHIR bundle JSON. */
export function convertHealthExport(source: Uint8Array | string, clinicalRecords: unknown[] = []): string {
  const scan = scanHealthExport(typeof source === 'string' ? [source] : decodeChunks(source));
  return JSON.stringify(healthExportToFhir(scan, clinicalRecords), null, 2);
}
