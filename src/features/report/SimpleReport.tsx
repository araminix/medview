import { X } from 'lucide-react';
import { useMemo } from 'react';
import { useApp, useRecord } from '@/app/store';
import { Card } from '@/components/Card';
import { t } from '@/i18n';
import { bodySystemLabel } from '@/i18n/format';
import { buildTimeline, filterBySystem, summarizeZones } from '@/domain/selectors';
import { AttentionBox } from './AttentionBox';
import { BodyMap } from './BodyMap';
import { ConditionsCard, ImmunizationsCard, MedicationsCard } from './ClinicalLists';
import { LabsTable } from './LabsTable';
import { NotesCard, WarningsCard } from './NotesCard';
import { Timeline } from './Timeline';

/** Tab 1: the doctor- and patient-facing report. */
export function SimpleReport() {
  const record = useRecord();
  const bodyFilter = useApp((state) => state.bodyFilter);
  const setBodyFilter = useApp((state) => state.setBodyFilter);
  const zones = useMemo(() => summarizeZones(record), [record]);
  const view = useMemo(() => filterBySystem(record, bodyFilter), [record, bodyFilter]);
  const timeline = useMemo(() => buildTimeline(record), [record]);

  return (
    <div className="flex max-w-7xl flex-col gap-4 p-4 lg:p-6" data-testid="simple-report">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <AttentionBox record={record} />
        <Card title={t('report.bodyMap')} aside={t('report.bodyMapHint')}>
          <BodyMap zones={zones} selected={bodyFilter} onSelect={setBodyFilter} />
        </Card>
      </div>

      {bodyFilter && (
        <div data-testid="filter-banner" className="flex items-center gap-2 rounded-lg bg-accent-tint px-4 py-2 text-sm text-accent-strong">
          <span>
            {t('report.filter')} <strong>{bodySystemLabel(bodyFilter)}</strong>
          </span>
          <button
            type="button"
            data-testid="show-all"
            onClick={() => setBodyFilter(undefined)}
            className="ms-auto inline-flex items-center gap-1 rounded-full border border-accent/40 bg-surface px-3 py-0.5 text-xs font-semibold hover:bg-accent-wash"
          >
            <X size={12} /> {t('report.showAll')}
          </button>
        </div>
      )}

      <LabsTable id="labs" title={t('section.labs')} labs={view.labs} />
      <div className="grid gap-4 lg:grid-cols-2">
        <MedicationsCard medications={view.medications} />
        <ConditionsCard conditions={view.conditions} />
      </div>
      {(view.vitals.length > 0 || !bodyFilter) && <LabsTable id="vitals" title={t('section.vitals')} labs={view.vitals} grouped={false} />}
      {!bodyFilter && (
        <>
          <Timeline events={timeline} />
          <ImmunizationsCard immunizations={record.immunizations} procedures={record.procedures} />
          <NotesCard notes={record.documents} />
          <WarningsCard warnings={record.meta.warnings} />
        </>
      )}
    </div>
  );
}
