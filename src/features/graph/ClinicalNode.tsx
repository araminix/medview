import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { cx } from '@/lib/browser';
import { NODE_HEIGHT, NODE_WIDTH, nodeColor, type Direction, type ViewNode } from './model';

export type ClinicalNodeData = { node: ViewNode; direction: Direction; dimmed: boolean };
export type ClinicalFlowNode = Node<ClinicalNodeData, 'clinical'>;

/** A resource card with a colour-coded accent strip on its left edge. */
export const ClinicalNode = memo(function ClinicalNode({ data, selected }: NodeProps<ClinicalFlowNode>) {
  const { node, direction, dimmed } = data;
  const horizontal = direction === 'LR';
  return (
    <div
      data-testid="graph-node"
      data-kind={node.kind}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT, borderLeftColor: nodeColor(node) }}
      className={cx(
        'flex flex-col justify-center rounded-md border border-l-[5px] border-line bg-surface px-3 transition-opacity',
        selected && 'ring-2 ring-accent',
        dimmed && 'opacity-25',
        Boolean(node.clusterSize) && 'border-dashed',
      )}
    >
      <Handle type="target" position={horizontal ? Position.Left : Position.Top} className="!size-1.5 !border-0 !bg-muted" />
      <p className="truncate text-[13px] leading-tight font-semibold text-ink">{node.label}</p>
      <p className="tnum truncate text-[11px] text-muted">{node.sublabel}</p>
      <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} className="!size-1.5 !border-0 !bg-muted" />
    </div>
  );
});
