import '@xyflow/react/dist/style.css';
import { Background, Controls, MarkerType, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow, type Edge } from '@xyflow/react';
import { ArrowDownUp, ArrowLeftRight, Download, Maximize } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useApp, useRecord } from '@/app/store';
import { Button } from '@/components/Button';
import type { GraphNodeKind } from '@/domain/types';
import { cx, downloadBlob } from '@/lib/browser';
import { ClinicalNode, type ClinicalFlowNode } from './ClinicalNode';
import { buildSvg, svgToPng } from './exportImage';
import { buildView, connectedIds, KIND_STYLES, layout, nodeColor, type Direction } from './model';
import { NodeDrawer } from './NodeDrawer';

const NODE_TYPES = { clinical: ClinicalNode };
/** Fitting never zooms out so far that labels become unreadable; larger graphs are panned instead. */
const FIT = { padding: 0.15, duration: 200, minZoom: 0.45 };

function baseName(fileName: string | undefined): string {
  return (fileName ?? 'medview').replace(/\.[^.]+$/, '');
}

function Canvas() {
  const record = useRecord();
  const fileName = useApp((state) => state.file?.name);
  const flow = useReactFlow();
  const [hiddenKinds, setHiddenKinds] = useState<ReadonlySet<GraphNodeKind>>(new Set());
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const [direction, setDirection] = useState<Direction>('LR');
  const [hovered, setHovered] = useState<string>();
  const [selected, setSelected] = useState<string>();

  const kinds = useMemo(() => [...new Set(record.graph.nodes.map((n) => n.kind))], [record]);
  const view = useMemo(() => buildView(record.graph, { hiddenKinds, abnormalOnly }), [record, hiddenKinds, abnormalOnly]);
  const positions = useMemo(() => layout(view, direction), [view, direction]);
  const chain = useMemo(() => (hovered ? connectedIds(hovered, view.edges) : undefined), [hovered, view]);

  const nodes = useMemo<ClinicalFlowNode[]>(
    () =>
      view.nodes.map((node) => ({
        id: node.id,
        type: 'clinical',
        position: positions.get(node.id) ?? { x: 0, y: 0 },
        selected: node.id === selected,
        data: { node, direction, dimmed: chain ? !chain.has(node.id) : false },
      })),
    [view, positions, direction, chain, selected],
  );

  const edges = useMemo<Edge[]>(
    () =>
      view.edges.map((edge) => {
        const inChain = chain ? chain.has(edge.source) && chain.has(edge.target) : false;
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: inChain ? edge.label : undefined,
          // xyflow draws animated edges as moving dashes — the "care chain" highlight.
          animated: inChain,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: { stroke: inChain ? 'var(--mv-accent)' : 'var(--mv-muted)', strokeWidth: inChain ? 2 : 1, opacity: chain && !inChain ? 0.15 : 0.6 },
        };
      }),
    [view, chain],
  );

  // Re-fit whenever the set of nodes or the layout direction changes — once xyflow has measured them.
  const measured = useNodesInitialized();
  useEffect(() => {
    if (measured) void flow.fitView(FIT);
  }, [flow, positions, measured]);

  const toggleKind = (kind: GraphNodeKind) => {
    const next = new Set(hiddenKinds);
    if (!next.delete(kind)) next.add(kind);
    setHiddenKinds(next);
  };

  const exportSvg = () => buildSvg(view.nodes, view.edges, positions, direction, nodeColor);
  const downloadSvg = () => downloadBlob(exportSvg(), `${baseName(fileName)}-map.svg`, 'image/svg+xml');
  const downloadPng = async () => downloadBlob(await svgToPng(exportSvg()), `${baseName(fileName)}-map.png`, 'image/png');
  const selectedNode = view.nodes.find((node) => node.id === selected);

  return (
    <div className="flex h-full flex-col" data-testid="visual-map">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface px-3 py-2">
        {kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={!hiddenKinds.has(kind)}
            data-testid={`kind-${kind}`}
            onClick={() => toggleKind(kind)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
              hiddenKinds.has(kind) ? 'border-line text-muted line-through opacity-60' : 'border-line bg-surface text-ink',
            )}
          >
            <span className="size-2 rounded-full" style={{ background: KIND_STYLES[kind].color }} aria-hidden="true" />
            {KIND_STYLES[kind].label}
          </button>
        ))}
        <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink has-checked:border-crit has-checked:bg-crit-bg has-checked:text-crit-text">
          <input type="checkbox" data-testid="abnormal-only" className="size-3.5 accent-(--mv-crit)" checked={abnormalOnly} onChange={(event) => setAbnormalOnly(event.target.checked)} />
          Abnormal only
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" onClick={() => setDirection(direction === 'LR' ? 'TB' : 'LR')} data-testid="toggle-direction" title="Switch layout direction">
            {direction === 'LR' ? <ArrowLeftRight size={14} /> : <ArrowDownUp size={14} />}
            {direction === 'LR' ? 'Left → Right' : 'Top → Bottom'}
          </Button>
          <Button size="sm" onClick={() => void flow.fitView(FIT)}>
            <Maximize size={14} /> Fit view
          </Button>
          <Button size="sm" onClick={() => void downloadPng()} data-testid="download-png">
            <Download size={14} /> PNG
          </Button>
          <Button size="sm" onClick={downloadSvg} data-testid="download-svg">
            <Download size={14} /> SVG
          </Button>
        </div>
      </div>

      {view.clustered && (
        <p data-testid="cluster-note" className="border-b border-line bg-warn-bg px-4 py-1.5 text-xs text-warn-text">
          This file has {record.graph.nodes.length.toLocaleString('en-US')} linked items. Large groups are shown as one node to keep the diagram responsive.
        </p>
      )}

      <div className="relative min-h-0 flex-1 bg-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          nodesConnectable={false}
          nodesDraggable={false}
          minZoom={0.05}
          proOptions={{ hideAttribution: true }}
          onNodeMouseEnter={(_, node) => setHovered(node.id)}
          onNodeMouseLeave={() => setHovered(undefined)}
          onNodeClick={(_, node) => setSelected(node.id)}
          onPaneClick={() => setSelected(undefined)}
        >
          <Background color="var(--mv-border)" gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
        {selectedNode && <NodeDrawer node={selectedNode} onClose={() => setSelected(undefined)} />}
      </div>
    </div>
  );
}

/** Tab 2: the interactive resource graph. */
export function VisualMap() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
