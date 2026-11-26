/** How the many readings of one Apple Health type are reduced to a single line of the report. */
export type Reduction = 'latest' | 'daily';

export interface HealthType {
  /** Name shown in the report. */
  name: string;
  loinc?: string;
  reduce: Reduction;
  category: 'vital-signs' | 'activity' | 'laboratory';
  /** Overrides the unit written in the export, e.g. "count/min" → "bpm". */
  unit?: string;
  /** The export stores percentages as fractions (0.97). */
  fraction?: boolean;
}

export interface Reading {
  value: number;
  unit: string;
  /** ISO date-time. */
  date: string;
}

/** Everything kept from an export.xml after one pass over it. */
export interface HealthScan {
  birthDate?: string;
  sex?: string;
  bloodType?: string;
  exportDate?: string;
  /** Number of <Record> elements seen, kept or not. */
  records: number;
  latest: Map<string, Reading & { count: number }>;
  /** type → day → source → total of that day. Two devices counting the same steps must not be added up. */
  daily: Map<string, { unit: string; days: Map<string, Map<string, number>> }>;
  /** Paths of the FHIR files the export refers to. */
  clinicalFiles: string[];
}
