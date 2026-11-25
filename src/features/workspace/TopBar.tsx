import { EyeOff, Menu, Printer, Trash2, TriangleAlert } from 'lucide-react';
import { useApp, useRecord } from '@/app/store';
import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { Pill } from '@/components/Pill';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TrustPill } from '@/components/TrustPill';
import { cx } from '@/lib/browser';
import type { WorkspaceTab } from '@/lib/preferences';

const TABS: Array<[WorkspaceTab, string]> = [
  ['report', 'Simple Report'],
  ['map', 'Visual Map'],
  ['dev', 'Dev View'],
];

function Tabs() {
  const tab = useApp((state) => state.tab);
  const setTab = useApp((state) => state.setTab);
  return (
    <div role="tablist" aria-label="Workspace views" className="flex gap-1">
      {TABS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`tab-${id}`}
          aria-selected={tab === id}
          aria-controls="workspace-panel"
          tabIndex={tab === id ? 0 : -1}
          onClick={() => setTab(id)}
          onKeyDown={(event) => {
            const index = TABS.findIndex(([t]) => t === tab);
            const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            const next = TABS[(index + step + TABS.length) % TABS.length][0];
            setTab(next);
            document.getElementById(`tab-${next}`)?.focus();
          }}
          className={cx(
            '-mb-px border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap',
            tab === id ? 'border-accent text-accent-strong' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function TopBar({ onToggleSidebar }: { onToggleSidebar(): void }) {
  const record = useRecord();
  const file = useApp((state) => state.file);
  const scrubbed = useApp((state) => state.scrubbed);
  const openModal = useApp((state) => state.openModal);
  const clearFile = useApp((state) => state.clearFile);
  const warnings = record.meta.warnings.filter((w) => w.severity !== 'info').length;

  return (
    <header className="no-print border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2 sm:px-4">
        <button type="button" onClick={onToggleSidebar} aria-label="Toggle patient sidebar" className="rounded-md p-1.5 text-muted hover:bg-sunken lg:hidden">
          <Menu size={18} />
        </button>
        <Logo compact />
        <div className="flex min-w-0 items-center gap-2">
          <span className="max-w-56 truncate text-sm font-medium text-ink" title={file?.name}>
            {file?.name}
          </span>
          <Pill tone="accent" className="tnum">
            <span data-testid="format-badge">{record.meta.summary}</span>
          </Pill>
          {warnings > 0 && (
            <a href="#warnings" data-testid="warning-pill">
              <Pill tone="warn">
                <TriangleAlert size={12} /> {warnings} warning{warnings === 1 ? '' : 's'}
              </Pill>
            </a>
          )}
          {scrubbed && <Pill tone="ok">Anonymized</Pill>}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <TrustPill short />
          <Button size="sm" onClick={() => openModal('scrubber')} data-testid="open-scrubber">
            <EyeOff size={14} /> <span className="hidden md:inline">Hide Private Info</span>
          </Button>
          <Button size="sm" onClick={() => openModal('print')} data-testid="open-print">
            <Printer size={14} /> <span className="hidden md:inline">Print / PDF</span>
          </Button>
          <ThemeToggle />
          <Button size="sm" variant="danger" onClick={clearFile} data-testid="clear-file" title="Clear file and wipe it from memory">
            <Trash2 size={14} /> <span className="hidden md:inline">Clear File</span>
          </Button>
        </div>
      </div>
      <div className="px-3 sm:px-4">
        <Tabs />
      </div>
    </header>
  );
}
