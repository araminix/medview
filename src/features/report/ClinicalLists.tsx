import { Card, EmptyNote } from '@/components/Card';
import { Pill, type Tone } from '@/components/Pill';
import { t } from '@/i18n';
import { formatDate, statusLabel } from '@/i18n/format';
import type { ClinicalStatus, ConditionItem, ImmunizationItem, MedItem, ProcedureItem } from '@/domain/types';
import { CodeChips } from './CodeChips';

const STATUS_TONE: Record<ClinicalStatus, Tone> = { active: 'accent', inactive: 'neutral', unknown: 'neutral' };

function StatusPill({ status }: { status: ClinicalStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{statusLabel(status)}</Pill>;
}

/** Active entries first, then historical ones. */
function activeFirst<T extends { status: ClinicalStatus }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(a.status === 'inactive') - Number(b.status === 'inactive'));
}

export function MedicationsCard({ medications }: { medications: MedItem[] }) {
  return (
    <Card id="medications" title={t('section.medications')} aside={medications.length} flush>
      {medications.length === 0 && <EmptyNote>{t('med.none')}</EmptyNote>}
      <ul className="divide-y divide-line">
        {activeFirst(medications).map((med) => (
          <li key={med.id} data-testid="medication" className="px-4 py-2.5">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-sm font-medium text-ink" dir="auto">
                {med.name}
              </p>
              <StatusPill status={med.status} />
            </div>
            {med.dosage && (
              <p className="tnum mt-0.5 text-sm text-ink" dir="auto">
                {med.dosage}
                {med.route ? ` · ${med.route}` : ''}
              </p>
            )}
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {med.date && <span className="tnum">{t('med.since', { date: formatDate(med.date) })}</span>}
              {med.prescriber && <span>{t('med.by', { name: med.prescriber })}</span>}
              <CodeChips codes={med.codes} />
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ConditionsCard({ conditions }: { conditions: ConditionItem[] }) {
  return (
    <Card id="conditions" title={t('section.conditions')} aside={conditions.length} flush>
      {conditions.length === 0 && <EmptyNote>{t('cond.none')}</EmptyNote>}
      <ul className="divide-y divide-line">
        {activeFirst(conditions).map((condition) => (
          <li key={condition.id} data-testid="condition" className="px-4 py-2.5">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-sm font-medium text-ink" dir="auto">
                {condition.name}
              </p>
              <StatusPill status={condition.status} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {condition.onset && <span className="tnum">{t('cond.onset', { date: formatDate(condition.onset) })}</span>}
              {condition.resolved && <span className="tnum">{t('cond.resolved', { date: formatDate(condition.resolved) })}</span>}
              <CodeChips codes={condition.codes} />
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ImmunizationsCard({ immunizations, procedures }: { immunizations: ImmunizationItem[]; procedures: ProcedureItem[] }) {
  const rows = [
    ...immunizations.map((i) => ({ id: i.id, kind: t('kind.immunization'), name: i.name, date: i.date, codes: i.codes })),
    ...procedures.map((p) => ({ id: p.id, kind: t('kind.procedure'), name: p.name, date: p.date, codes: p.codes })),
  ];
  if (rows.length === 0) return null;
  return (
    <Card id="immunizations" title={t('section.immunizations')} aside={rows.length} flush>
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
            <Pill>{row.kind}</Pill>
            <span className="min-w-0 flex-1 text-sm font-medium text-ink" dir="auto">
              {row.name}
            </span>
            <CodeChips codes={row.codes.slice(0, 1)} />
            <span className="tnum text-xs text-muted">{formatDate(row.date)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
