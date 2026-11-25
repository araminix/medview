import { describe, expect, test } from 'vitest';
import type { GraphEdge, GraphNode } from '@/domain/types';
import { buildView, connectedIds, layout, MAX_NODES } from '@/features/graph/model';
import { recordOf, sample } from './helpers';

const NO_FILTER = { hiddenKinds: new Set<never>(), abnormalOnly: false };

describe('graph view', () => {
  const { graph } = recordOf(sample('complex-care.fhir.json'));

  test('small graphs are drawn node by node', () => {
    const view = buildView(graph, NO_FILTER);
    expect(view.clustered).toBe(false);
    expect(view.nodes).toHaveLength(50);
  });

  test('hiding a type removes its nodes and their edges', () => {
    const view = buildView(graph, { hiddenKinds: new Set(['observation']), abnormalOnly: false });
    expect(view.nodes.some((n) => n.kind === 'observation')).toBe(false);
    expect(view.edges.every((e) => !e.target.startsWith('Observation/'))).toBe(true);
  });

  test('"abnormal only" keeps abnormal findings and the path back to the patient', () => {
    const view = buildView(graph, { hiddenKinds: new Set(), abnormalOnly: true });
    const ids = view.nodes.map((n) => n.id);
    expect(ids).toContain('Observation/obs-hba1c');
    expect(ids).toContain('Encounter/enc-1');
    expect(ids).toContain('Patient/pat-delgado');
    expect(ids).not.toContain('Observation/obs-creat');
  });

  test('follows a care chain in both directions', () => {
    const chain = connectedIds('Encounter/enc-1', graph.edges);
    expect(chain.has('Patient/pat-delgado')).toBe(true);
    expect(chain.has('Observation/obs-hba1c')).toBe(true);
    expect(chain.has('Encounter/enc-2')).toBe(false);
  });

  test('layout places every node', () => {
    const view = buildView(graph, NO_FILTER);
    const positions = layout(view, 'LR');
    expect(positions.size).toBe(view.nodes.length);
    expect(positions.get('Patient/pat-delgado')!.x).toBeLessThan(positions.get('Encounter/enc-1')!.x);
  });
});

test('large graphs collapse big groups into cluster nodes', () => {
  const nodes: GraphNode[] = [{ id: 'p', kind: 'patient', label: 'P' }, { id: 'e', kind: 'encounter', label: 'E' }];
  const edges: GraphEdge[] = [{ id: 'p->e', source: 'p', target: 'e' }];
  for (let i = 0; i < 5000; i += 1) {
    nodes.push({ id: `o${i}`, kind: 'observation', label: `O${i}`, abnormal: i % 10 === 0 });
    edges.push({ id: `e->o${i}`, source: 'e', target: `o${i}` });
  }
  const view = buildView({ nodes, edges }, NO_FILTER);
  expect(view.clustered).toBe(true);
  expect(view.nodes.length).toBeLessThanOrEqual(MAX_NODES);
  expect(view.nodes.find((n) => n.id === 'cluster:observation')).toMatchObject({ clusterSize: 5000, label: 'Observations × 5,000', sublabel: '500 abnormal · grouped' });
  expect(view.edges).toEqual([expect.objectContaining({ source: 'p', target: 'e' }), expect.objectContaining({ source: 'e', target: 'cluster:observation' })]);
});
