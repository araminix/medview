import type { Coding } from './types';

const SYSTEMS: Array<[needle: string, name: string]> = [
  ['loinc', 'LOINC'],
  ['2.16.840.1.113883.6.1', 'LOINC'],
  ['snomed', 'SNOMED'],
  ['2.16.840.1.113883.6.96', 'SNOMED'],
  ['rxnorm', 'RxNorm'],
  ['2.16.840.1.113883.6.88', 'RxNorm'],
  ['icd-10', 'ICD-10'],
  ['icd10', 'ICD-10'],
  ['2.16.840.1.113883.6.90', 'ICD-10'],
  ['2.16.840.1.113883.6.3', 'ICD-10'],
  ['icd-9', 'ICD-9'],
  ['2.16.840.1.113883.6.103', 'ICD-9'],
  ['cvx', 'CVX'],
  ['2.16.840.1.113883.12.292', 'CVX'],
  ['ndc', 'NDC'],
  ['2.16.840.1.113883.6.69', 'NDC'],
  ['cpt', 'CPT'],
  ['2.16.840.1.113883.6.12', 'CPT'],
  ['atc', 'ATC'],
];

/** Short display name for a code-system URI, OID or HL7 v2 table id (LN, SCT, I10…). */
export function systemName(system: string | undefined): string | undefined {
  if (!system) return undefined;
  const raw = system.trim();
  const v2: Record<string, string> = { LN: 'LOINC', SCT: 'SNOMED', I10: 'ICD-10', I9: 'ICD-9', RXNORM: 'RxNorm', CVX: 'CVX', NDC: 'NDC' };
  if (v2[raw.toUpperCase()]) return v2[raw.toUpperCase()];
  const lower = raw.toLowerCase().replace(/^urn:oid:/, '');
  return SYSTEMS.find(([needle]) => lower.includes(needle))?.[1];
}

export function findCode(codes: Coding[], system: string): string | undefined {
  return codes.find((c) => c.system === system)?.code;
}

export function formatCoding(coding: Coding): string {
  return `${coding.system ?? 'Code'} ${coding.code}${coding.display ? ` — ${coding.display}` : ''}`;
}
