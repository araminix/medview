import { useApp } from '@/app/store';
import { Button } from '@/components/Button';
import type { LoadStage } from '@/engine/api';
import { formatBytes } from '@/lib/browser';

const STAGES: Array<[LoadStage, string]> = [
  ['reading', 'Reading file'],
  ['decoding', 'Detecting format'],
  ['parsing', 'Parsing records'],
  ['rendering', 'Building report'],
];

/** Shown while the worker parses. The UI thread stays free, so Cancel always responds. */
export function LoadingPanel() {
  const stage = useApp((state) => state.stage);
  const file = useApp((state) => state.file);
  const cancelLoad = useApp((state) => state.cancelLoad);
  const index = Math.max(0, STAGES.findIndex(([id]) => id === stage));
  const percent = ((index + 1) / (STAGES.length + 1)) * 100;

  return (
    <div className="rounded-xl border border-line bg-surface p-6" role="status" aria-live="polite" data-testid="loading-panel">
      <div className="flex items-baseline gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-ink">{file?.name}</p>
        {file && <span className="tnum text-xs text-muted">{formatBytes(file.size)}</span>}
        <Button size="sm" className="ml-auto" onClick={cancelLoad}>
          Cancel
        </Button>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">{STAGES[index][1]}… everything happens on this device.</p>
    </div>
  );
}
