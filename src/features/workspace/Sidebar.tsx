import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useApp, useRecord } from '@/app/store';
import { formatDate } from '@/domain/dates';
import { sectionLinks } from '@/domain/selectors';
import type { ClinicalRecord } from '@/domain/types';

function PatientCard({ record }: { record: ClinicalRecord }) {
  const { patient } = record;
  const facts: Array<[string, string | undefined]> = [
    ['Born', patient.dob ? `${formatDate(patient.dob)}${patient.age !== undefined ? ` · ${patient.age} y` : ''}` : undefined],
    ['Sex', patient.sex ? patient.sex[0].toUpperCase() + patient.sex.slice(1) : undefined],
    ...patient.identifiers.slice(0, 3).map((id): [string, string] => [id.label, id.value]),
  ];
  return (
    <div className="px-4 py-3" data-testid="patient-card">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Patient</p>
      <p className="mt-0.5 text-base leading-snug font-semibold text-ink" data-testid="patient-name">
        {patient.name ?? 'Name not stated'}
      </p>
      <dl className="mt-2 space-y-1 text-[13px]">
        {facts.map(([label, value]) =>
          value ? (
            <div key={`${label}-${value}`} className="flex gap-2">
              <dt className="w-12 shrink-0 text-muted">{label}</dt>
              <dd className="tnum min-w-0 break-words text-ink">{value}</dd>
            </div>
          ) : null,
        )}
      </dl>
    </div>
  );
}

/** Allergies are a safety risk, so they stay pinned no matter which tab is open. */
function AllergyStrip({ record }: { record: ClinicalRecord }) {
  const allergies = record.allergies.filter((a) => a.status !== 'inactive');
  if (allergies.length === 0) {
    return (
      <div className="mx-3 flex items-center gap-2 rounded-md bg-ok-bg px-3 py-2 text-[13px] font-medium text-ok-text" data-testid="allergies">
        <ShieldCheck size={15} /> No Known Allergies (NKA)
      </div>
    );
  }
  return (
    <div className="mx-3 rounded-md border border-crit/30 bg-crit-bg px-3 py-2" data-testid="allergies" role="note" aria-label="Allergies">
      <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-crit-text uppercase">
        <ShieldAlert size={14} /> Allergies
      </p>
      <ul className="mt-1 space-y-0.5 text-[13px] text-crit-text">
        {allergies.map((allergy) => (
          <li key={allergy.id}>
            <strong className="font-semibold">{allergy.substance}</strong>
            {allergy.reaction ? ` — ${allergy.reaction}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate(): void }) {
  const record = useRecord();
  const setTab = useApp((state) => state.setTab);
  const setBodyFilter = useApp((state) => state.setBodyFilter);

  const jump = (id: string) => {
    setTab('report');
    setBodyFilter(undefined);
    onNavigate();
    // The report may have just been mounted by the tab switch; wait a frame before scrolling.
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto pb-4">
      <PatientCard record={record} />
      <AllergyStrip record={record} />
      <nav aria-label="Report sections" className="mt-3 px-2">
        <ul>
          {sectionLinks(record).map((link) => (
            <li key={link.id}>
              <button
                type="button"
                onClick={() => jump(link.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink hover:bg-accent-tint hover:text-accent-strong"
              >
                <span className="min-w-0 flex-1 truncate">{link.label}</span>
                {link.count !== undefined && <span className="tnum text-xs text-muted">{link.count}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
