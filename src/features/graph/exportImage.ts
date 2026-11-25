import type { GraphEdge } from '@/domain/types';
import { NODE_HEIGHT, NODE_WIDTH, type Direction, type Positioned, type ViewNode } from './model';

const PADDING = 24;

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** CSS variables do not exist inside a standalone SVG file, so colours are resolved to their values. */
function resolveColor(color: string): string {
  const variable = /^var\((--[\w-]+)\)$/.exec(color)?.[1];
  return variable ? getComputedStyle(document.documentElement).getPropertyValue(variable).trim() : color;
}

/**
 * Draws the diagram as a self-contained vector SVG from the layout itself — no DOM
 * screenshotting, so nothing is fetched and the result is real, editable vector art.
 */
export function buildSvg(nodes: ViewNode[], edges: GraphEdge[], positions: Map<string, Positioned>, direction: Direction, colorOf: (node: ViewNode) => string): string {
  const placed = nodes.flatMap((node) => {
    const position = positions.get(node.id);
    return position ? [{ node, ...position }] : [];
  });
  const minX = Math.min(...placed.map((p) => p.x)) - PADDING;
  const minY = Math.min(...placed.map((p) => p.y)) - PADDING;
  const width = Math.max(...placed.map((p) => p.x + NODE_WIDTH)) + PADDING - minX;
  const height = Math.max(...placed.map((p) => p.y + NODE_HEIGHT)) + PADDING - minY;
  const palette = { surface: resolveColor('var(--mv-surface)'), border: resolveColor('var(--mv-border)'), text: resolveColor('var(--mv-text)'), muted: resolveColor('var(--mv-muted)'), canvas: resolveColor('var(--mv-canvas)') };

  const paths = edges.flatMap((edge) => {
    const from = positions.get(edge.source);
    const to = positions.get(edge.target);
    if (!from || !to) return [];
    const [x1, y1, x2, y2] =
      direction === 'LR'
        ? [from.x + NODE_WIDTH, from.y + NODE_HEIGHT / 2, to.x, to.y + NODE_HEIGHT / 2]
        : [from.x + NODE_WIDTH / 2, from.y + NODE_HEIGHT, to.x + NODE_WIDTH / 2, to.y];
    const curve = direction === 'LR' ? `C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}` : `C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
    return [`<path d="M ${x1} ${y1} ${curve}" fill="none" stroke="${palette.muted}" stroke-opacity="0.55" stroke-width="1.2" marker-end="url(#arrow)"/>`];
  });

  const boxes = placed.map(({ node, x, y }) => {
    const color = resolveColor(colorOf(node));
    return [
      `<g transform="translate(${x} ${y})">`,
      `<rect width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="6" fill="${palette.surface}" stroke="${palette.border}"/>`,
      `<rect width="5" height="${NODE_HEIGHT}" rx="2" fill="${color}"/>`,
      `<text x="16" y="22" font-size="13" font-weight="600" fill="${palette.text}">${escapeXml(truncate(node.label, 26))}</text>`,
      `<text x="16" y="40" font-size="11" fill="${palette.muted}">${escapeXml(truncate(node.sublabel ?? '', 32))}</text>`,
      '</g>',
    ].join('');
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}" font-family="Inter, system-ui, sans-serif">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${palette.muted}"/></marker></defs>`,
    `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${palette.canvas}"/>`,
    ...paths,
    ...boxes,
    '</svg>',
  ].join('\n');
}

/** Rasterizes an SVG string to a high-resolution PNG entirely in memory. */
export async function svgToPng(svg: string, scale = 3): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The diagram could not be rendered'));
      image.src = url;
    });
    // Very large diagrams are scaled down to stay within canvas size limits.
    const factor = Math.min(scale, 12000 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * factor);
    canvas.height = Math.round(image.height * factor);
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
