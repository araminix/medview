import dagre from '@dagrejs/dagre';
import type { GraphEdge, GraphNode, GraphNodeKind } from '@/domain/types';

export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 54;
/** Above this many nodes, large groups collapse into one cluster node so the canvas stays fluid. */
export const MAX_NODES = 200;
const CLUSTER_THRESHOLD = 12;

export interface KindStyle {
  label: string;
  /** CSS colour of the left accent strip. */
  color: string;
}

export const KIND_STYLES: Record<GraphNodeKind, KindStyle> = {
  patient: { label: 'Patient', color: 'var(--mv-text)' },
  encounter: { label: 'Encounters', color: 'var(--mv-accent)' },
  condition: { label: 'Conditions', color: 'var(--mv-warn)' },
  observation: { label: 'Observations', color: 'var(--mv-ok)' },
  medication: { label: 'Medications', color: 'var(--mv-med)' },
  allergy: { label: 'Allergies', color: 'var(--mv-crit)' },
  report: { label: 'Reports', color: '#0891b2' },
  practitioner: { label: 'Practitioners', color: '#64748b' },
  organization: { label: 'Organizations', color: '#64748b' },
  immunization: { label: 'Immunizations', color: '#0d9488' },
  procedure: { label: 'Procedures', color: '#4f46e5' },
  other: { label: 'Other', color: '#94a3b8' },
};

/** Abnormal findings are always crimson, whatever their type. */
export function nodeColor(node: Pick<GraphNode, 'kind' | 'abnormal'>): string {
  return node.abnormal ? 'var(--mv-crit)' : KIND_STYLES[node.kind].color;
}

export interface GraphFilters {
  hiddenKinds: ReadonlySet<GraphNodeKind>;
  abnormalOnly: boolean;
}

export interface ViewNode extends GraphNode {
  /** Number of original nodes folded into this one, when it is a cluster. */
  clusterSize?: number;
}

export interface GraphView {
  nodes: ViewNode[];
  edges: GraphEdge[];
  clustered: boolean;
}

function dedupeEdges(edges: GraphEdge[], known: Set<string>): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const id = `${edge.source}->${edge.target}`;
    if (edge.source === edge.target || seen.has(id) || !known.has(edge.source) || !known.has(edge.target)) return false;
    seen.add(id);
    return true;
  });
}

/** Folds every kind with many nodes into a single "Observations × 9,800" node. */
function cluster(nodes: GraphNode[], edges: GraphEdge[]): GraphView {
  const byKind = new Map<GraphNodeKind, GraphNode[]>();
  for (const node of nodes) byKind.set(node.kind, [...(byKind.get(node.kind) ?? []), node]);

  const alias = new Map<string, string>();
  const view: ViewNode[] = [];
  for (const [kind, members] of byKind) {
    if (kind === 'patient' || members.length <= CLUSTER_THRESHOLD) {
      view.push(...members);
      continue;
    }
    const id = `cluster:${kind}`;
    const abnormal = members.filter((m) => m.abnormal).length;
    members.forEach((member) => alias.set(member.id, id));
    view.push({
      id,
      kind,
      label: `${KIND_STYLES[kind].label} × ${members.length.toLocaleString('en-US')}`,
      sublabel: abnormal ? `${abnormal.toLocaleString('en-US')} abnormal · grouped` : 'Grouped — filter to expand',
      abnormal: false,
      clusterSize: members.length,
    });
  }
  const mapped = edges.map((edge) => {
    const source = alias.get(edge.source) ?? edge.source;
    const target = alias.get(edge.target) ?? edge.target;
    return { ...edge, id: `${source}->${target}`, source, target, label: alias.has(edge.source) || alias.has(edge.target) ? undefined : edge.label };
  });
  return { nodes: view, edges: dedupeEdges(mapped, new Set(view.map((n) => n.id))), clustered: true };
}

/** Applies the filter bar, then clusters if the result is still too large to draw node by node. */
export function buildView(graph: { nodes: GraphNode[]; edges: GraphEdge[] }, filters: GraphFilters): GraphView {
  let nodes = graph.nodes.filter((node) => !filters.hiddenKinds.has(node.kind));
  if (filters.abnormalOnly) {
    // Keep abnormal findings plus the context that leads to them (patient, encounters, reports).
    const keep = new Set(nodes.filter((n) => n.abnormal).map((n) => n.id));
    const parents = new Map<string, string[]>();
    for (const edge of graph.edges) parents.set(edge.target, [...(parents.get(edge.target) ?? []), edge.source]);
    const queue = [...keep];
    while (queue.length) {
      for (const parent of parents.get(queue.pop()!) ?? []) {
        if (!keep.has(parent)) {
          keep.add(parent);
          queue.push(parent);
        }
      }
    }
    nodes = nodes.filter((node) => keep.has(node.id) || node.kind === 'patient');
  }
  const edges = dedupeEdges(graph.edges, new Set(nodes.map((n) => n.id)));
  return nodes.length > MAX_NODES ? cluster(nodes, edges) : { nodes, edges, clustered: false };
}

export type Direction = 'LR' | 'TB';

export interface Positioned {
  id: string;
  x: number;
  y: number;
}

/** Dagre layered layout; returns the top-left corner of every node. */
export function layout(view: GraphView, direction: Direction): Map<string, Positioned> {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: direction, nodesep: 18, ranksep: direction === 'LR' ? 90 : 60, marginx: 20, marginy: 20 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of view.nodes) graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const edge of view.edges) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);
  return new Map(
    view.nodes.map((node) => {
      const { x, y } = graph.node(node.id);
      return [node.id, { id: node.id, x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 }];
    }),
  );
}

/** Everything upstream and downstream of a node: its care chain. */
export function connectedIds(startId: string, edges: GraphEdge[]): Set<string> {
  const connected = new Set([startId]);
  const walk = (from: 'source' | 'target', to: 'source' | 'target') => {
    const queue = [startId];
    while (queue.length) {
      const current = queue.pop()!;
      for (const edge of edges) {
        if (edge[from] === current && !connected.has(edge[to])) {
          connected.add(edge[to]);
          queue.push(edge[to]);
        }
      }
    }
  };
  walk('source', 'target');
  walk('target', 'source');
  return connected;
}
