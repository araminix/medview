import { Code2, X } from 'lucide-react';
import { useApp, useRecord } from '@/app/store';
import { Button } from '@/components/Button';
import { CodeBlock } from '@/components/CodeBlock';
import { formatCoding } from '@/domain/codes';
import { digits, ltr, t, term } from '@/i18n';
import { bodySystemLabel, flagLabel, formatDate, kindLabel, statusLabel } from '@/i18n/format';
import type { ClinicalRecord } from '@/domain/types';
import { engine } from '@/engine/client';
import { useAsync } from '@/lib/useAsync';
import type { ViewNode } from './model';

/** Human-readable facts about the clinical item behind a node, looked up by its source. */
function describe(record: ClinicalRecord, sourceId: string): Array<[string, string]> {
  const facts: Array<[string, string | undefined]> = [];
  const lab = [...record.labs, ...record.vitals].find((l) => l.sourceId === sourceId);
  const med = record.medications.find((m) => m.sourceId === sourceId);
  const condition = record.conditions.find((c) => c.sourceId === sourceId);
  const encounter = record.encounters.find((e) => e.sourceId === sourceId);
  const allergy = record.allergies.find((a) => a.sourceId === sourceId);
  if (lab) facts.push([t('fact.result'), ltr(`${digits(lab.valueText)} ${lab.unit ?? ''}`)], [t('fact.flag'), flagLabel(lab.flag)], [t('fact.reference'), lab.refText && ltr(digits(lab.refText))], [t('fact.date'), formatDate(lab.date, true)], [t('fact.bodySystem'), bodySystemLabel(lab.bodySystem)]);
  if (med) facts.push([t('fact.dosage'), med.dosage], [t('fact.status'), statusLabel(med.status)], [t('fact.since'), med.date && formatDate(med.date)], [t('fact.prescriber'), med.prescriber]);
  if (condition) facts.push([t('fact.status'), statusLabel(condition.status)], [t('fact.onset'), condition.onset && formatDate(condition.onset)], [t('fact.bodySystem'), bodySystemLabel(condition.bodySystem)]);
  if (encounter) facts.push([t('fact.type'), term(encounter.kind)], [t('fact.from'), formatDate(encounter.start, true)], [t('fact.to'), encounter.end && formatDate(encounter.end, true)], [t('fact.location'), encounter.location], [t('fact.provider'), encounter.provider]);
  if (allergy) facts.push([t('fact.reaction'), allergy.reaction], [t('fact.severity'), term(allergy.severity)]);
  const codes = (lab ?? med ?? condition ?? allergy)?.codes ?? [];
  codes.slice(0, 3).forEach((code) => facts.push([t('fact.code'), formatCoding(code)]));
  return facts.filter((fact): fact is [string, string] => Boolean(fact[1]));
}

export function NodeDrawer({ node, onClose }: { node: ViewNode; onClose(): void }) {
  const record = useRecord();
  const inspectSource = useApp((state) => state.inspectSource);
  const raw = useAsync(node.sourceId ?? null, () => engine.call('getSource', node.sourceId!));
  const facts = node.sourceId ? describe(record, node.sourceId) : [];

  return (
    <aside data-testid="node-drawer" aria-label={t('drawer.label')} className="absolute inset-y-0 end-0 z-10 flex w-full max-w-sm flex-col border-s border-line bg-surface shadow-xl">
      <header className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{kindLabel(node.kind)}</p>
          <h2 className="text-sm font-semibold text-ink" dir="auto">
            {term(node.label)}
          </h2>
          {node.sublabel && (
            <p className="tnum text-xs text-muted" dir="auto">
              {term(node.sublabel)}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label={t('drawer.close')} className="ms-auto rounded p-1 text-muted hover:bg-sunken hover:text-ink">
          <X size={16} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {node.clusterSize ? (
          <p className="p-4 text-sm text-ink">
            {t('drawer.cluster', { count: node.clusterSize.toLocaleString('en-US') })}
          </p>
        ) : (
          <>
            {facts.length > 0 && (
              <dl className="space-y-1.5 border-b border-line p-4 text-[13px]">
                {facts.map(([label, value], index) => (
                  <div key={index} className="flex gap-3">
                    <dt className="w-24 shrink-0 text-muted">{label}</dt>
                    <dd className="tnum min-w-0 break-words text-ink" dir="auto">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="flex items-center gap-2 px-4 pt-3">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('drawer.raw')}</p>
              {node.sourceId && (
                <Button size="sm" variant="ghost" className="ms-auto" onClick={() => inspectSource(node.sourceId!)}>
                  <Code2 size={14} /> {t('drawer.openDev')}
                </Button>
              )}
            </div>
            <div className="p-4 pt-2">
              <CodeBlock code={raw.value ?? (raw.loading ? t('drawer.loading') : t('drawer.none'))} syntax={record.meta.syntax} className="max-h-96 rounded-md" />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
