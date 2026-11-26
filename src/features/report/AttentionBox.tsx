import { CircleCheck, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/Card';
import { ltr, t } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { abnormalLabs, activeConditions } from '@/domain/selectors';
import type { ClinicalRecord } from '@/domain/types';
import { flagArrow } from './FlagBadge';

/** The red flags a clinician needs in two seconds: abnormal labs first, then active conditions. */
export function AttentionBox({ record }: { record: ClinicalRecord }) {
  const labs = abnormalLabs(record.labs);
  const conditions = activeConditions(record.conditions);
  const quiet = labs.length === 0 && conditions.length === 0;

  return (
    <Card
      id="overview"
      title={
        <span className="flex items-center gap-1.5">
          <TriangleAlert size={15} className="text-crit" aria-hidden="true" /> {t('report.attention')}
        </span>
      }
      aside={quiet ? undefined : t('report.attentionAside', { labs: labs.length, conditions: conditions.length })}
      flush
    >
      {quiet && (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-ok-text">
          <CircleCheck size={16} /> {t('report.quiet')}
        </p>
      )}
      {labs.length > 0 && (
        <ul data-testid="abnormal-labs" className="divide-y divide-line">
          {labs.map((lab) => (
            <li key={lab.id} className="flex items-baseline gap-2 px-4 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink" dir="auto">
                {lab.name}
              </span>
              <bdi dir="ltr" className="tnum text-sm font-semibold whitespace-nowrap text-crit-text">
                {lab.valueText} {lab.unit} {flagArrow(lab.flag)}
              </bdi>
              <span className="tnum hidden w-32 shrink-0 text-end text-xs text-muted sm:block">{lab.refText ? t('report.ref', { range: ltr(lab.refText) }) : ''}</span>
              <span className="tnum hidden w-24 shrink-0 text-end text-xs whitespace-nowrap text-muted md:block">{formatDate(lab.date)}</span>
            </li>
          ))}
        </ul>
      )}
      {conditions.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('report.activeConditions')}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {conditions.map((condition) => (
              <li key={condition.id} dir="auto" className="rounded-md bg-warn-bg px-2 py-1 text-[13px] font-medium text-warn-text">
                {condition.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
