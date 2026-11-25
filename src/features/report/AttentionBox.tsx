import { CircleCheck, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/Card';
import { formatDate } from '@/domain/dates';
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
          <TriangleAlert size={15} className="text-crit" aria-hidden="true" /> Clinical attention
        </span>
      }
      aside={quiet ? undefined : `${labs.length} abnormal · ${conditions.length} active`}
      flush
    >
      {quiet && (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-ok-text">
          <CircleCheck size={16} /> No abnormal results or active conditions in this file.
        </p>
      )}
      {labs.length > 0 && (
        <ul data-testid="abnormal-labs" className="divide-y divide-line">
          {labs.map((lab) => (
            <li key={lab.id} className="flex items-baseline gap-2 px-4 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{lab.name}</span>
              <span className="tnum text-sm font-semibold whitespace-nowrap text-crit-text">
                {lab.valueText} {lab.unit} {flagArrow(lab.flag)}
              </span>
              <span className="tnum hidden w-32 shrink-0 text-right text-xs text-muted sm:block">{lab.refText ? `Ref ${lab.refText}` : ''}</span>
              <span className="tnum hidden w-20 shrink-0 text-right text-xs text-muted md:block">{formatDate(lab.date)}</span>
            </li>
          ))}
        </ul>
      )}
      {conditions.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Active conditions</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {conditions.map((condition) => (
              <li key={condition.id} className="rounded-md bg-warn-bg px-2 py-1 text-[13px] font-medium text-warn-text">
                {condition.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
