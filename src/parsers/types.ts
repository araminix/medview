import type { ClinicalRecord } from '@/domain/types';

/** What every format parser returns to the engine. */
export interface ParsedDocument {
  record: ClinicalRecord;
  /** Raw text of one source unit (resource, segment, section) for the inspector. */
  getSource(id: string): string | undefined;
  /** Parsed FHIR JSON root, when the document is FHIR — the FHIRPath evaluation context. */
  fhirRoot?: unknown;
}

/** Thrown for input that cannot be read at all; the UI shows the message in a friendly banner. */
export class UnreadableFileError extends Error {
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'UnreadableFileError';
    this.hint = hint;
  }
}
