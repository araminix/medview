export interface ScrubOptions {
  /** Replace patient and relative names. */
  names: boolean;
  /** Reduce the birth date to the year so age stays clinically valid. */
  birthDate: boolean;
  /** Replace MRN, SSN, insurance and national identifiers with synthetic hashes. */
  ids: boolean;
  /** Strip phone numbers, e-mail addresses and street addresses. */
  contacts: boolean;
  /** Mask doctor, hospital and organization names. */
  providers: boolean;
}

export const DEFAULT_SCRUB_OPTIONS: ScrubOptions = { names: true, birthDate: true, ids: true, contacts: true, providers: true };

export type PiiCategory = 'name' | 'birthDate' | 'id' | 'contact' | 'provider';

export interface PiiEntry {
  category: PiiCategory;
  original: string;
  replacement: string;
}

/** One line of the before → after preview. */
export interface ScrubChange extends PiiEntry {
  count: number;
}

export interface ScrubResult {
  text: string;
  changes: ScrubChange[];
}

export const REDACTED = '[REDACTED]';
