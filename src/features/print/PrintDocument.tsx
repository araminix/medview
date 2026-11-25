import { formatDate } from '@/domain/dates';
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
  if (labs.length === 0) return <p className="text-[13px]">No results to show.</p>;
  const cell = 'border border-slate-400 px-2 py-1';
  return (
    <table className="tnum w-full border-collapse text-left text-[12px]">
      <thead>
        <tr>
          {['Test', 'Result', 'Flag', 'Reference', 'Date'].map((heading) => (
            <th key={heading} className={`${cell} font-semibold`}>
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labs.map((lab) => (
          <tr key={lab.id}>
            <td className={cell}>{lab.name}</td>
            <td className={`${cell} ${isAbnormal(lab.flag) ? 'font-bold' : ''}`}>
              {lab.valueText} {lab.unit}
            </td>
            <td className={`${cell} font-bold`}>{isAbnormal(lab.flag) ? `${flagArrow(lab.flag)} ${lab.flag}` : ''}</td>
            <td className={cell}>{lab.refText ?? ''}</td>
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
    <article data-theme="light" data-testid="print-document" className="bg-white p-8 font-sans text-[13px] leading-snug text-black">
      <header className="flex items-end justify-between border-b-2 border-black pb-2">
        <h1 className="text-xl font-bold">Clinical Summary</h1>
        <p className="tnum text-[11px]">Printed {formatDate(new Date().toISOString())} · {record.meta.summary}</p>
      </header>

      {options.header && (
        <section data-print-section="header" className="mt-4">
          <p className="text-lg font-bold">{patient.name ?? 'Name not stated'}</p>
          <p className="tnum">
            {[
              patient.dob ? `Born ${formatDate(patient.dob)}` : undefined,
              patient.age !== undefined ? `${patient.age} years` : undefined,
              patient.sex,
              ...patient.identifiers.slice(0, 2).map((id) => `${id.label} ${id.value}`),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="mt-2 border-2 border-black px-3 py-1.5 font-bold">
            ALLERGIES:{' '}
            {allergies.length
              ? allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ''}`).join('; ')
              : 'No known allergies (NKA)'}
          </p>
        </section>
      )}

      {options.labs && (
        <Section id="labs" title={options.abnormalOnly ? 'Abnormal laboratory results' : 'Laboratory results'}>
          <LabsGrid labs={labs} />
        </Section>
      )}

      {options.medications && (
        <Section id="medications" title="Active medications">
          <ul className="list-disc pl-5">
            {medications.map((med) => (
              <li key={med.id}>
                <strong>{med.name}</strong>
                {med.dosage ? ` — ${med.dosage}` : ''}
              </li>
            ))}
            {medications.length === 0 && <li>None recorded</li>}
          </ul>
        </Section>
      )}

      {options.conditions && (
        <Section id="conditions" title="Active conditions / diagnoses">
          <ul className="list-disc pl-5">
            {conditions.map((condition) => (
              <li key={condition.id}>
                {condition.name}
                {condition.codes[0] ? ` (${condition.codes[0].system ?? ''} ${condition.codes[0].code})` : ''}
                {condition.onset ? ` — since ${formatDate(condition.onset)}` : ''}
              </li>
            ))}
            {conditions.length === 0 && <li>None recorded</li>}
          </ul>
        </Section>
      )}

      {options.bodyMap && (
        <Section id="bodyMap" title="Body map">
          <div className="max-w-md">
            <BodyMap zones={summarizeZones(record)} onSelect={() => {}} interactive={false} />
          </div>
        </Section>
      )}

      {options.timeline && (
        <Section id="timeline" title="Visits timeline">
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
        Generated locally via MedView — Verify against official hospital source
      </footer>
    </article>
  );
}
