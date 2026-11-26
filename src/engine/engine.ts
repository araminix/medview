import { evalFhirPath } from '@medplum/core';
import { zipSync } from 'fflate';
import { summarizeRecord } from '@/domain/summary';
import type { ClinicalRecord } from '@/domain/types';
import { parseBytes, parseDicom, parseText, UnreadableFileError, type NamedBytes, type ParsedDocument } from '@/parsers';
import type { FrameImage, RenderOptions } from '@/parsers/dicom/pixels';
import { scrubText, type ScrubChange, type ScrubOptions } from '@/scrubber';
import { scrubDicom } from '@/scrubber/dicom';
import type { EngineApi, LoadStage, LoadedFile, QueryResult, RawSlice, ScrubbedFile } from './api';

interface Loaded {
  text: string;
  document: ParsedDocument;
  /** The dropped DICOM files, kept so they can be anonymized byte for byte. */
  files?: NamedBytes[];
}

const MAX_QUERY_VALUES = 200;
const MAX_SEARCH_HITS = 2000;

function display(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/** Holds the currently open file. Runs inside the worker; plain class so it is unit-testable. */
export class Engine implements EngineApi {
  private original?: Loaded;
  private current?: Loaded;

  constructor(private readonly onProgress: (stage: LoadStage) => void = () => {}) {}

  private get active(): Loaded {
    if (!this.current) throw new UnreadableFileError('No file is open');
    return this.current;
  }

  private snapshot(): LoadedFile {
    return { record: this.active.document.record, scrubbed: this.current !== this.original };
  }

  load(bytes: Uint8Array): LoadedFile {
    this.onProgress('decoding');
    const parsed = parseBytes(bytes, () => this.onProgress('parsing'));
    this.original = this.current = parsed;
    this.onProgress('rendering');
    return this.snapshot();
  }

  getSource(id: string): string | undefined {
    return this.active.document.getSource(id);
  }

  rawText(limit: number): RawSlice {
    const { text } = this.active;
    return { text: text.slice(0, limit), totalLength: text.length, truncated: text.length > limit };
  }

  search(keyword: string): string[] {
    const needle = keyword.trim().toLowerCase();
    if (!needle) return [];
    const { document } = this.active;
    const hits: string[] = [];
    for (const source of document.record.sources) {
      const haystack = `${source.id} ${source.label} ${document.getSource(source.id) ?? ''}`.toLowerCase();
      if (haystack.includes(needle)) hits.push(source.id);
      if (hits.length >= MAX_SEARCH_HITS) break;
    }
    return hits;
  }

  fhirPath(expression: string): QueryResult {
    const root = this.active.document.fhirRoot;
    if (!root) return { values: [], total: 0, error: 'FHIRPath is available for FHIR files only.' };
    try {
      const results = evalFhirPath(expression, root);
      return { values: results.slice(0, MAX_QUERY_VALUES).map(display), total: results.length };
    } catch (error) {
      return { values: [], total: 0, error: error instanceof Error ? error.message : 'Invalid expression' };
    }
  }

  /** The anonymized file and what was changed in it. DICOM is rewritten byte for byte; everything else as text. */
  private scrub(options: ScrubOptions): { loaded: () => Loaded; changes: ScrubChange[]; text: string; files?: NamedBytes[] } {
    const { text, document, files } = this.original ?? this.active;
    if (files) {
      const changes = new Map<string, ScrubChange>();
      const scrubbed = files.map(({ name, bytes }) => ({ name, bytes: scrubDicom(bytes, options, changes) }));
      const loaded = () => {
        const { text: dump, ...parsed } = parseDicom(scrubbed);
        return { text: dump, document: parsed, files: scrubbed };
      };
      return { loaded, changes: [...changes.values()], text, files: scrubbed };
    }
    // The parsed FHIR root is only reusable for JSON; XML is re-read by the scrubber.
    const result = scrubText(text, options, document.record.meta.syntax === 'json' ? document.fhirRoot : undefined);
    return { loaded: () => ({ text: result.text, document: parseText(result.text) }), changes: result.changes, text: result.text };
  }

  previewScrub(options: ScrubOptions) {
    return this.scrub(options).changes;
  }

  applyScrub(options: ScrubOptions): LoadedFile {
    this.current = this.scrub(options).loaded();
    return this.snapshot();
  }

  revertScrub(): LoadedFile {
    this.current = this.original;
    return this.snapshot();
  }

  scrubbedFile(options: ScrubOptions): ScrubbedFile {
    const { text, files } = this.scrub(options);
    if (!files) return { content: text, kind: 'text' };
    if (files.length === 1) return { content: files[0].bytes, kind: 'dicom' };
    return { content: zipSync(Object.fromEntries(files.map(({ name, bytes }) => [name, bytes])), { level: 0 }), kind: 'zip' };
  }

  imageFrame(index: number, options?: RenderOptions): FrameImage | undefined {
    return this.active.document.renderFrame?.(index, options);
  }

  scrubbedRecord(options: ScrubOptions): ClinicalRecord {
    return this.scrub(options).loaded().document.record;
  }

  safeSummary(options: ScrubOptions): string {
    return summarizeRecord(this.scrubbedRecord(options));
  }
}
