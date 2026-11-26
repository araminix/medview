import { ArrowRight, CircleCheck, Eye, Info, ShieldAlert, Siren, Stethoscope } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useApp, useRecord } from '@/app/store';
import { Button } from '@/components/Button';
import { medicinePurpose } from '@/domain/guidance/medicines';
import { buildPlainSummary } from '@/domain/guidance/summarize';
import type { PlainSummary } from '@/domain/guidance/types';
import type { ClinicalRecord } from '@/domain/types';
import { cx } from '@/lib/browser';
import { FindingCard } from './FindingCard';
import { t, term } from '@/i18n';

const OVERALL: Record<PlainSummary['overall'], { icon: typeof Siren; tone: string }> = {
  emergency: { icon: Siren, tone: 'border-crit/40 bg-crit-bg text-crit-text' },
  soon: { icon: Stethoscope, tone: 'border-warn/40 bg-warn-bg text-warn-text' },
  routine: { icon: Eye, tone: 'border-accent/40 bg-accent-tint text-accent-strong' },
  clear: { icon: CircleCheck, tone: 'border-ok/40 bg-ok-bg text-ok-text' },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <div className="mt-2 text-[15px] text-ink">{children}</div>
    </section>
  );
}

function Greeting({ record }: { record: ClinicalRecord }) {
  const { patient } = record;
  const facts = [patient.age !== undefined ? t('summary.age', { age: patient.age }) : undefined, patient.sex ? term(patient.sex) : undefined].filter(Boolean).join(' · ');
  return (
    <header>
      <h2 className="text-2xl font-semibold tracking-tight text-ink">{patient.name ? t('summary.heading', { name: patient.name }) : t('summary.headingAnonymous')}</h2>
      {facts && <p className="mt-0.5 text-[15px] text-muted">{facts}</p>}
    </header>
  );
}

function Allergies({ record }: { record: ClinicalRecord }) {
  const allergies = record.allergies.filter((a) => a.status !== 'inactive');
  if (allergies.length === 0) return null;
  return (
    <div className="flex gap-3 rounded-xl border border-crit/40 bg-crit-bg p-4 text-[15px] text-crit-text" data-testid="summary-allergies">
      <ShieldAlert size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>
        <strong className="font-semibold">{t('summary.allergic')} </strong>
        <span dir="auto">{allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction.toLowerCase()})` : ''}`).join(', ')}</span>
        <span className="block">{t('summary.allergicTell')}</span>
      </p>
    </div>
  );
}

function Medicines({ record }: { record: ClinicalRecord }) {
  const medicines = record.medications.filter((m) => m.status !== 'inactive');
  if (medicines.length === 0) return null;
  return (
    <Section title={t('summary.medicines')}>
      <ul className="divide-y divide-line" data-testid="summary-medicines">
        {medicines.map((medicine) => {
          const purpose = medicinePurpose(medicine.name);
          return (
            <li key={medicine.id} className="py-2">
              <p className="font-medium" dir="auto">
                {medicine.name}
              </p>
              <p className="tnum text-muted">{[purpose ? t('summary.medicineUsually', { purpose }) : undefined, medicine.dosage].filter(Boolean).join(' · ') || t('summary.medicineAsk')}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[13px] text-muted">{t('summary.medicinesNote')}</p>
    </Section>
  );
}

/** Tab for readers with no medical background: what is wrong, how serious it is, and what to do. */
export function SummaryView() {
  const record = useRecord();
  const setTab = useApp((state) => state.setTab);
  const summary = useMemo(() => buildPlainSummary(record), [record]);
  const overall = OVERALL[summary.overall];
  const Icon = overall.icon;

  return (
    <div className="flex max-w-3xl flex-col gap-4 p-4 lg:p-6" data-testid="summary-view">
      <Greeting record={record} />

      <div data-testid="summary-overall" data-overall={summary.overall} className={cx('flex gap-3 rounded-xl border p-4', overall.tone)}>
        <Icon size={24} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-lg leading-snug font-semibold">{t(`summary.overall.${summary.overall}.title`)}</p>
          <p className="mt-0.5 text-[15px]">{t(`summary.overall.${summary.overall}.text`)}</p>
        </div>
      </div>

      <p className="flex gap-2 rounded-lg bg-sunken px-3 py-2 text-[13px] text-muted">
        <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          {t('summary.disclaimerBefore')} <strong>{t('summary.disclaimerStrong')}</strong>
          {t('common.sentenceEnd')} {t('summary.disclaimerAfter')}
        </span>
      </p>

      <Allergies record={record} />

      {summary.findings.map((finding) => (
        <FindingCard key={finding.id} finding={finding} />
      ))}

      {summary.otherConditions.length > 0 && (
        <Section title={t('summary.otherConditions')}>
          <ul className="list-disc space-y-0.5 ps-5" data-testid="other-conditions">
            {summary.otherConditions.map((name) => (
              <li key={name} dir="auto">
                {name}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-muted">{t('summary.otherConditionsNote')}</p>
        </Section>
      )}

      {summary.otherResults.length > 0 && (
        <Section title={t('summary.otherResults')}>
          <ul className="divide-y divide-line" data-testid="other-results">
            {summary.otherResults.map((result) => (
              <li key={result.label} className="py-1.5">
                <span className="tnum font-medium" dir="auto">
                  {result.label}
                </span>
                {result.detail && <span className="text-muted"> — {result.detail}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-muted">{t('summary.otherResultsNote')}</p>
        </Section>
      )}

      <Medicines record={record} />

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Button onClick={() => setTab('report')} data-testid="open-detailed-report">
          {t('summary.details')} <ArrowRight size={15} className="rtl:rotate-180" />
        </Button>
        <span className="text-[13px] text-muted">{t('summary.detailsNote')}</span>
      </div>
    </div>
  );
}
