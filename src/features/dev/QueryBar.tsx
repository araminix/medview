import { Play, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { cx } from '@/lib/browser';
import { t } from '@/i18n';

export type QueryMode = 'search' | 'fhirpath';

const PRESETS = [
  "entry.resource.ofType(Observation).where(interpretation.coding.code = 'H')",
  'entry.resource.ofType(Patient).name',
  'entry.resource.ofType(Condition).code.coding.code',
  'entry.resource.ofType(MedicationRequest).medication.text',
  'entry.resource.resourceType.distinct()',
];

interface QueryBarProps {
  fhir: boolean;
  mode: QueryMode;
  onModeChange(mode: QueryMode): void;
  keyword: string;
  onKeywordChange(keyword: string): void;
  onRunFhirPath(expression: string): void;
}

export function QueryBar({ fhir, mode, onModeChange, keyword, onKeywordChange, onRunFhirPath }: QueryBarProps) {
  const [expression, setExpression] = useState(PRESETS[0]);
  const run = (value: string) => {
    setExpression(value);
    onRunFhirPath(value);
  };

  return (
    <div className="border-b border-line bg-surface px-3 py-2">
      <div className="flex items-center gap-2">
        {fhir && (
          <div role="radiogroup" aria-label={t('dev.queryMode')} className="flex shrink-0 rounded-md border border-line p-0.5">
            {(['search', 'fhirpath'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                data-testid={`mode-${value}`}
                onClick={() => onModeChange(value)}
                className={cx('rounded px-2.5 py-1 text-xs font-medium', mode === value ? 'bg-accent-tint text-accent-strong' : 'text-muted hover:text-ink')}
              >
                {value === 'search' ? t('dev.keyword') : 'FHIRPath'}
              </button>
            ))}
          </div>
        )}
        {mode === 'search' ? (
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t('dev.searchLabel')}</span>
            <Search size={15} className="absolute top-1/2 start-2.5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={keyword}
              data-testid="keyword-input"
              onChange={(event) => onKeywordChange(event.target.value)}
              placeholder={t('dev.searchPlaceholder')}
              className="h-9 w-full rounded-md border border-line bg-surface pe-3 ps-8 text-sm text-ink"
            />
          </label>
        ) : (
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onRunFhirPath(expression);
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('dev.fhirpathLabel')}</span>
              <input
                value={expression}
                data-testid="fhirpath-input"
                onChange={(event) => setExpression(event.target.value)}
                spellCheck={false}
                dir="ltr"
                className="h-9 w-full rounded-md border border-line bg-surface px-3 font-mono text-xs text-ink"
              />
            </label>
            <Button type="submit" variant="primary" data-testid="fhirpath-run">
              <Play size={14} className="rtl:rotate-180" /> {t('dev.run')}
            </Button>
          </form>
        )}
      </div>
      {mode === 'fhirpath' && (
        <div className="mt-2 flex flex-wrap gap-1.5" dir="ltr">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => run(preset)}
              className="max-w-full truncate rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] text-muted hover:border-accent hover:text-accent-strong"
            >
              {preset}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
