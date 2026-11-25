import { evalFhirPath } from '@medplum/core';
import { summarizeRecord } from '@/domain/summary';
import { parseBytes, parseText, UnreadableFileError, type ParsedDocument } from '@/parsers';
import { scrubText, type ScrubOptions } from '@/scrubber';
import type { EngineApi, LoadStage, LoadedFile, QueryResult, RawSlice } from './api';

interface Loaded {
  text: string;
  document: ParsedDocument;
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

  private scrub(options: ScrubOptions) {
    const { text, document } = this.original ?? this.active;
    // The parsed FHIR root is only reusable for JSON; XML is re-read by the scrubber.
    return scrubText(text, options, document.record.meta.syntax === 'json' ? document.fhirRoot : undefined);
  }

  previewScrub(options: ScrubOptions) {
    return this.scrub(options).changes;
  }

  applyScrub(options: ScrubOptions): LoadedFile {
    const { text } = this.scrub(options);
    this.current = { text, document: parseText(text) };
    return this.snapshot();
  }

  revertScrub(): LoadedFile {
    this.current = this.original;
    return this.snapshot();
  }

  scrubbedText(options: ScrubOptions): string {
    return this.scrub(options).text;
  }

  safeSummary(options: ScrubOptions): string {
    return summarizeRecord(parseText(this.scrub(options).text).record);
  }
}
