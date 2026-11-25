import type { ClinicalRecord, GraphEdge, GraphNode, ParseWarning, RecordMeta, SourceRef } from './types';

/** Accumulates a ClinicalRecord while a parser walks its input. */
export class RecordBuilder {
  readonly record: ClinicalRecord;
  private counter = 0;
  private readonly nodeIds = new Set<string>();
  private readonly edgeIds = new Set<string>();

  constructor(meta: Omit<RecordMeta, 'warnings' | 'summary'> & { summary?: string }) {
    this.record = {
      meta: { summary: '', ...meta, warnings: [] },
      patient: { identifiers: [], contacts: [] },
      allergies: [],
      labs: [],
      vitals: [],
      medications: [],
      conditions: [],
      encounters: [],
      immunizations: [],
      procedures: [],
      documents: [],
      graph: { nodes: [], edges: [] },
      sources: [],
    };
  }

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  warn(message: string, path?: string, extra: Partial<ParseWarning> = {}): void {
    this.record.meta.warnings.push({ message, path, severity: 'warning', ...extra });
  }

  addSource(source: SourceRef): void {
    this.record.sources.push(source);
  }

  addNode(node: GraphNode): void {
    if (this.nodeIds.has(node.id)) return;
    this.nodeIds.add(node.id);
    this.record.graph.nodes.push(node);
  }

  hasNode(id: string): boolean {
    return this.nodeIds.has(id);
  }

  addEdge(source: string, target: string, label?: string): void {
    const id = `${source}->${target}`;
    if (source === target || this.edgeIds.has(id)) return;
    this.edgeIds.add(id);
    const edge: GraphEdge = { id, source, target, label };
    this.record.graph.edges.push(edge);
  }

  /** Drops edges whose endpoints never materialized (dangling references are reported separately). */
  finish(summary: string): ClinicalRecord {
    const { graph, meta } = this.record;
    graph.edges = graph.edges.filter((e) => this.nodeIds.has(e.source) && this.nodeIds.has(e.target));
    meta.summary = summary;
    return this.record;
  }
}

export function plural(count: number, noun: string): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
}
