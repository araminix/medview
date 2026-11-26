import { Check, ClipboardCopy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useApp, useRecord } from '@/app/store';
import { Button } from '@/components/Button';
import { CodeBlock } from '@/components/CodeBlock';
import type { ClinicalRecord, ParseWarning } from '@/domain/types';
import { engine } from '@/engine/client';
import { copyText, cx } from '@/lib/browser';
import { useAsync } from '@/lib/useAsync';
import { DEFAULT_SCRUB_OPTIONS } from '@/scrubber';
import { QueryBar, type QueryMode } from './QueryBar';
import { SourceTree } from './SourceTree';
import { digits, t, type MessageKey } from '@/i18n';

type Pane = 'raw' | 'normalized' | 'warnings';

const PANES: Array<[Pane, MessageKey]> = [
  ['raw', 'dev.paneRaw'],
  ['normalized', 'dev.paneNormalized'],
  ['warnings', 'dev.paneWarnings'],
];

/** How much of a whole file is shown when no single source is selected. */
const RAW_PREVIEW = 200_000;
const NORMALIZED_PREVIEW = 400_000;

/** The universal record as JSON, without the lookup tables that only serve the UI. */
function normalizedJson(record: ClinicalRecord): string {
  // `undefined` values are dropped by JSON.stringify, which removes the source index.
  return JSON.stringify({ ...record, sources: undefined, graph: { nodes: record.graph.nodes.length, edges: record.graph.edges.length } }, null, 2);
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function CopyButton({ label, testId, getText }: { label: string; testId: string; getText(): Promise<string> }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      data-testid={testId}
      onClick={() => {
        void getText()
          .then(copyText)
          .then((ok) => {
            setCopied(ok);
            setTimeout(() => setCopied(false), 1800);
          });
      }}
    >
      {copied ? <Check size={14} /> : <ClipboardCopy size={14} />} {copied ? t('common.copied') : label}
    </Button>
  );
}

function Diagnostics({ warnings }: { warnings: ParseWarning[] }) {
  if (warnings.length === 0) return <p className="p-4 text-sm text-ok-text">{t('dev.noProblems')}</p>;
  return (
    <ul className="divide-y divide-line" data-testid="diagnostics" dir="ltr">
      {warnings.map((warning, index) => (
        <li key={index} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2 text-[13px]">
          <span className={cx('w-16 shrink-0 text-xs font-semibold uppercase', warning.severity === 'info' ? 'text-muted' : 'text-warn-text')}>{warning.severity}</span>
          <span className="min-w-0 flex-1 text-ink">
            {warning.line ? `Line ${warning.line}: ` : ''}
            {warning.message}
          </span>
          {warning.path && <code className="font-mono text-xs text-muted">{warning.path}</code>}
        </li>
      ))}
    </ul>
  );
}

/** Tab 3: raw inspector for HealthTech engineers. */
export function DevView() {
  const record = useRecord();
  const selected = useApp((state) => state.selectedSource);
  const selectSource = useApp((state) => state.selectSource);
  const isFhir = record.meta.fhirPath === true;
  const [mode, setMode] = useState<QueryMode>('search');
  const [keyword, setKeyword] = useState('');
  const [expression, setExpression] = useState<string>();
  const [pane, setPane] = useState<Pane>('raw');

  const needle = useDebounced(keyword.trim(), 200);
  const hits = useAsync(needle ? `${needle}|${record.meta.summary}` : null, () => engine.call('search', needle));
  const matches = useMemo(() => (needle && hits.value ? new Set(hits.value) : undefined), [needle, hits.value]);
  const query = useAsync(expression ? `${expression}|${record.meta.summary}` : null, () => engine.call('fhirPath', expression!));
  // Without a selection the pane shows the head of the whole file.
  const raw = useAsync(`${selected ?? '*'}|${record.meta.summary}`, async () =>
    selected ? ((await engine.call('getSource', selected)) ?? '') : (await engine.call('rawText', RAW_PREVIEW)).text,
  );
  const normalized = useMemo(() => (pane === 'normalized' ? normalizedJson(record).slice(0, NORMALIZED_PREVIEW) : ''), [pane, record]);

  return (
    <div className="flex h-full flex-col" data-testid="dev-view">
      <QueryBar
        fhir={isFhir}
        mode={isFhir ? mode : 'search'}
        onModeChange={setMode}
        keyword={keyword}
        onKeywordChange={setKeyword}
        onRunFhirPath={setExpression}
      />

      {mode === 'fhirpath' && isFhir && expression && (
        <section className="max-h-64 overflow-y-auto border-b border-line" data-testid="fhirpath-results" aria-live="polite">
          {query.value?.error ? (
            <p className="bg-crit-bg px-4 py-2 font-mono text-xs text-crit-text" data-testid="fhirpath-error">
              {query.value.error}
            </p>
          ) : (
            <>
              <p className="bg-canvas px-4 py-1.5 text-xs text-muted">
                {query.loading
                  ? t('dev.evaluating')
                  : `${t('dev.results', { count: query.value?.total ?? 0 })} ${(query.value?.total ?? 0) > (query.value?.values.length ?? 0) ? t('dev.showingFirst', { count: query.value?.values.length ?? 0 }) : ''}`}
              </p>
              {query.value && query.value.values.length > 0 && <CodeBlock code={query.value.values.join('\n')} syntax="json" />}
            </>
          )}
        </section>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]">
        <div className="overflow-y-auto border-e border-line bg-surface">
          <p className="tnum border-b border-line bg-canvas px-3 py-1.5 text-xs text-muted">
            {matches
              ? t('dev.matches', { hits: matches.size.toLocaleString('en-US'), total: record.sources.length.toLocaleString('en-US'), needle })
              : t('dev.units', { count: record.sources.length.toLocaleString('en-US') })}
          </p>
          <SourceTree sources={record.sources} matches={matches} selected={selected} onSelect={(id) => { selectSource(id); setPane('raw'); }} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-1 border-b border-line bg-surface px-2">
            <div role="tablist" aria-label={t('dev.panes')} className="flex">
              {PANES.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={pane === id}
                  data-testid={`pane-${id}`}
                  onClick={() => setPane(id)}
                  className={cx('-mb-px border-b-2 px-2.5 py-2 text-xs font-medium whitespace-nowrap', pane === id ? 'border-accent text-accent-strong' : 'border-transparent text-muted hover:text-ink')}
                >
                  {t(label)}
                  {id === 'warnings' && record.meta.warnings.length > 0 && <span className="tnum ms-1 rounded-full bg-warn-bg px-1.5 text-warn-text">{digits(record.meta.warnings.length)}</span>}
                </button>
              ))}
            </div>
            <div className="ms-auto flex gap-1.5 py-1">
              <CopyButton label={t('dev.copyRaw')} testId="copy-raw" getText={async () => (selected ? ((await engine.call('getSource', selected)) ?? '') : (await engine.call('rawText', Number.MAX_SAFE_INTEGER)).text)} />
              <CopyButton label={t('dev.copyAnonymized')} testId="copy-anonymized" getText={async () => normalizedJson(await engine.call('scrubbedRecord', DEFAULT_SCRUB_OPTIONS))} />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-sunken">
            {pane === 'raw' && (
              <>
                <p className="border-b border-line bg-canvas px-3 py-1 text-[11px] text-muted">{selected ? <bdi dir="ltr">{selected}</bdi> : t('dev.wholeFile', { size: (RAW_PREVIEW / 1000).toFixed(0) })}</p>
                <CodeBlock code={raw.value ?? ''} syntax={record.meta.syntax} />
              </>
            )}
            {pane === 'normalized' && <CodeBlock code={normalized} syntax="json" />}
            {pane === 'warnings' && (
              <div className="bg-surface">
                <Diagnostics warnings={record.meta.warnings} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
