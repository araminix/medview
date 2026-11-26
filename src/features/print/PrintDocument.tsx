import { activeDirection, digits, t, term } from '@/i18n';
import { flagLabel, formatDate } from '@/i18n/format';
import { isAbnormal } from '@/domain/labs';
import { abnormalLabs, buildTimeline, summarizeZones } from '@/domain/selectors';
import type { ClinicalRecord, LabItem } from '@/domain/types';
import type { ReactNode } from 'react';
import { BodyMap } from '../report/BodyMap';
import { flagArrow } from '../report/FlagBadge';

export interface PrintOptions {
  header: boolean;
  labs: boolean;
  abnormalOnly: boolean;
  medications: boolean;
  conditions: boolean;
  bodyMap: boolean;
  timeline: boolean;
  anonymize: boolean;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  header: true,
  labs: true,
  abnormalOnly: true,
  medications: true,
  conditions: true,
  bodyMap: true,
  timeline: false,
  anonymize: false,
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section data-print-section={id} className="mt-5 break-inside-avoid">
      <h2 className="border-b border-black pb-1 text-[13px] font-bold tracking-wide uppercase">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function LabsGrid({ labs }: { labs: LabItem[] }) {
  if (labs.length === 0) return <p className="text-[13px]">{t('doc.noResults')}</p>;
  const cell = 'border border-slate-400 px-2 py-1';
  return (
    <table className="tnum w-full border-collapse text-start text-[12px]">
      <thead>
        <tr>
          {[t('table.test'), t('table.result'), t('table.flag'), t('table.referenceShort'), t('table.date')].map((heading) => (
            <th key={heading} className={`${cell} font-semibold`}>
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labs.map((lab) => (
          <tr key={lab.id}>
            <td className={cell} dir="auto">
              {lab.name}
            </td>
            <td className={`${cell} ${isAbnormal(lab.flag) ? 'font-bold' : ''}`}>
              <bdi dir="ltr">
                {digits(lab.valueText)} {lab.unit}
              </bdi>
            </td>
            <td className={`${cell} font-bold`}>{isAbnormal(lab.flag) ? `${flagArrow(lab.flag)} ${flagLabel(lab.flag)}` : ''}</td>
            <td className={cell}>
              <bdi dir="ltr">{digits(lab.refText)}</bdi>
            </td>
            <td className={cell}>{formatDate(lab.date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The printable clinical summary: black text on white paper regardless of the app theme.
 * Rendered twice — scaled down as the live preview, and full size into #print-root for the printer.
 */
export function PrintDocument({ record, options }: { record: ClinicalRecord; options: PrintOptions }) {
  const { patient } = record;
  const allergies = record.allergies.filter((a) => a.status !== 'inactive');
  const labs = options.abnormalOnly ? abnormalLabs(record.labs) : record.labs;
  const medications = record.medications.filter((m) => m.status !== 'inactive');
  const conditions = record.conditions.filter((c) => c.status !== 'inactive');

  return (
    <article data-theme="light" dir={activeDirection()} data-testid="print-document" className="bg-white p-8 font-sans text-[13px] leading-snug text-black">
      <header className="flex items-end justify-between border-b-2 border-black pb-2">
        <h1 className="text-xl font-bold">{t('doc.title')}</h1>
        <p className="tnum text-[11px]">
          {t('doc.printed', { date: formatDate(new Date().toISOString()) })} · <bdi dir="ltr">{record.meta.summary}</bdi>
        </p>
      </header>

      {options.header && (
        <section data-print-section="header" className="mt-4">
          <p className="text-lg font-bold" dir="auto">
            {patient.name ?? t('side.noName')}
          </p>
          <p className="tnum">
            {[
              patient.dob ? t('doc.born', { date: formatDate(patient.dob) }) : undefined,
              patient.age !== undefined ? t('doc.years', { age: patient.age }) : undefined,
              patient.sex ? term(patient.sex) : undefined,
              ...patient.identifiers.slice(0, 2).map((id) => `${id.label} ${id.value}`),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="mt-2 border-2 border-black px-3 py-1.5 font-bold">
            {t('doc.allergies')}{' '}
            {allergies.length
              ? allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ''}`).join('; ')
              : t('doc.nka')}
          </p>
        </section>
      )}

      {options.labs && (
        <Section id="labs" title={options.abnormalOnly ? t('doc.abnormalLabs') : t('doc.labs')}>
          <LabsGrid labs={labs} />
        </Section>
      )}

      {options.medications && (
        <Section id="medications" title={t('doc.medications')}>
          <ul className="list-disc ps-5">
            {medications.map((med) => (
              <li key={med.id} dir="auto">
                <strong>{med.name}</strong>
                {med.dosage ? ` — ${med.dosage}` : ''}
              </li>
            ))}
            {medications.length === 0 && <li>{t('doc.none')}</li>}
          </ul>
        </Section>
      )}

      {options.conditions && (
        <Section id="conditions" title={t('doc.conditions')}>
          <ul className="list-disc ps-5">
            {conditions.map((condition) => (
              <li key={condition.id} dir="auto">
                {condition.name}
                {condition.codes[0] ? ` (${condition.codes[0].system ?? ''} ${condition.codes[0].code})` : ''}
                {condition.onset ? ` — ${t('doc.since', { date: formatDate(condition.onset) })}` : ''}
              </li>
            ))}
            {conditions.length === 0 && <li>{t('doc.none')}</li>}
          </ul>
        </Section>
      )}

      {options.bodyMap && (
        <Section id="bodyMap" title={t('doc.bodyMap')}>
          <div className="max-w-md">
            <BodyMap zones={summarizeZones(record)} onSelect={() => {}} interactive={false} />
          </div>
        </Section>
      )}

      {options.timeline && (
        <Section id="timeline" title={t('doc.timeline')}>
          <ul>
            {buildTimeline(record).map((event) => (
              <li key={event.id} className="tnum flex gap-3 py-0.5">
                <span className="w-24 shrink-0">{formatDate(event.date)}</span>
                <span>
                  {event.title}
                  {event.detail ? ` — ${event.detail}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <footer className="mt-8 border-t border-slate-400 pt-2 text-[11px] text-slate-600">
        {t('doc.footer')}
      </footer>
    </article>
  );
}
