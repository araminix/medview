import type { ClinicalRecord } from '@/domain/types';
import type { FrameImage, RenderOptions } from '@/parsers/dicom/pixels';
import type { ScrubChange, ScrubOptions } from '@/scrubber';

export interface LoadedFile {
  record: ClinicalRecord;
  /** True while the anonymized version of the file is the one being shown. */
  scrubbed: boolean;
}

/** The anonymized file as it is downloaded: text in the original syntax, one DICOM file, or a zip of a DICOM series. */
export interface ScrubbedFile {
  content: string | Uint8Array;
  kind: 'text' | 'dicom' | 'zip';
}

export interface RawSlice {
  text: string;
  totalLength: number;
  truncated: boolean;
}

export interface QueryResult {
  /** Pretty-printed result values, capped for display. */
  values: string[];
  total: number;
  error?: string;
}

export type LoadStage = 'reading' | 'decoding' | 'parsing' | 'rendering';

/**
 * Everything the UI can ask of the parsing engine. The engine lives in a Web Worker and
 * owns the raw file text; the UI thread only ever holds the compact ClinicalRecord.
 */
export interface EngineApi {
  load(bytes: Uint8Array): LoadedFile;
  getSource(id: string): string | undefined;
  rawText(limit: number): RawSlice;
  /** Ids of the sources whose raw text contains the keyword. */
  search(keyword: string): string[];
  fhirPath(expression: string): QueryResult;
  previewScrub(options: ScrubOptions): ScrubChange[];
  applyScrub(options: ScrubOptions): LoadedFile;
  revertScrub(): LoadedFile;
  /** The whole file, anonymized, in its original syntax. */
  scrubbedFile(options: ScrubOptions): ScrubbedFile;
  /** One picture of a DICOM file, drawn with the file's brightness window or a change to it. */
  imageFrame(index: number, options?: RenderOptions): FrameImage | undefined;
  /** The anonymized record, without switching the current view to it. */
  scrubbedRecord(options: ScrubOptions): ClinicalRecord;
  /** Plain-text clinical summary of the anonymized file. */
  safeSummary(options: ScrubOptions): string;
}

export type EngineMethod = keyof EngineApi;

export interface EngineRequest {
  id: number;
  method: EngineMethod;
  args: unknown[];
}

export type EngineMessage =
  | { type: 'progress'; id: number; stage: LoadStage }
  | { type: 'result'; id: number; value: unknown }
  | { type: 'error'; id: number; message: string; hint?: string };
