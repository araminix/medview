import { Code2, X } from 'lucide-react';
import { useApp, useRecord } from '@/app/store';
import { Button } from '@/components/Button';
import { CodeBlock } from '@/components/CodeBlock';
import { formatCoding } from '@/domain/codes';
import { formatDate } from '@/domain/dates';
import type { ClinicalRecord } from '@/domain/types';
import { engine } from '@/engine/client';
import { useAsync } from '@/lib/useAsync';
import { KIND_STYLES, type ViewNode } from './model';

/** Human-readable facts about the clinical item behind a node, looked up by its source. */
function describe(record: ClinicalRecord, sourceId: string): Array<[string, string]> {
  const facts: Array<[string, string | undefined]> = [];
  const lab = [...record.labs, ...record.vitals].find((l) => l.sourceId === sourceId);
  const med = record.medications.find((m) => m.sourceId === sourceId);
  const condition = record.conditions.find((c) => c.sourceId === sourceId);
  const encounter = record.encounters.find((e) => e.sourceId === sourceId);
  const allergy = record.allergies.find((a) => a.sourceId === sourceId);
  if (lab) facts.push(['Result', `${lab.valueText} ${lab.unit ?? ''}`], ['Flag', lab.flag], ['Reference', lab.refText], ['Date', formatDate(lab.date, true)], ['Body system', lab.bodySystem]);
  if (med) facts.push(['Dosage', med.dosage], ['Status', med.status], ['Since', med.date && formatDate(med.date)], ['Prescriber', med.prescriber]);
  if (condition) facts.push(['Status', condition.status], ['Onset', condition.onset && formatDate(condition.onset)], ['Body system', condition.bodySystem]);
  if (encounter) facts.push(['Type', encounter.kind], ['From', formatDate(encounter.start, true)], ['To', encounter.end && formatDate(encounter.end, true)], ['Location', encounter.location], ['Provider', encounter.provider]);
  if (allergy) facts.push(['Reaction', allergy.reaction], ['Severity', allergy.severity]);
  const codes = (lab ?? med ?? condition ?? allergy)?.codes ?? [];
  codes.slice(0, 3).forEach((code) => facts.push(['Code', formatCoding(code)]));
  return facts.filter((fact): fact is [string, string] => Boolean(fact[1]));
}

export function NodeDrawer({ node, onClose }: { node: ViewNode; onClose(): void }) {
  const record = useRecord();
  const inspectSource = useApp((state) => state.inspectSource);
  const raw = useAsync(node.sourceId ?? null, () => engine.call('getSource', node.sourceId!));
  const facts = node.sourceId ? describe(record, node.sourceId) : [];

  return (
    <aside data-testid="node-drawer" aria-label="Selected item" className="absolute inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col border-l border-line bg-surface shadow-xl">
      <header className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{KIND_STYLES[node.kind].label}</p>
          <h2 className="text-sm font-semibold text-ink">{node.label}</h2>
          {node.sublabel && <p className="tnum text-xs text-muted">{node.sublabel}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" className="ml-auto rounded p-1 text-muted hover:bg-sunken hover:text-ink">
          <X size={16} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {node.clusterSize ? (
          <p className="p-4 text-sm text-ink">
            {node.clusterSize.toLocaleString('en-US')} items are grouped here so the diagram stays responsive. Hide other types or switch on “Abnormal only” to see them
            individually.
          </p>
        ) : (
          <>
            {facts.length > 0 && (
              <dl className="space-y-1.5 border-b border-line p-4 text-[13px]">
                {facts.map(([label, value], index) => (
                  <div key={index} className="flex gap-3">
                    <dt className="w-24 shrink-0 text-muted">{label}</dt>
                    <dd className="tnum min-w-0 break-words text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="flex items-center gap-2 px-4 pt-3">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Raw source</p>
              {node.sourceId && (
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => inspectSource(node.sourceId!)}>
                  <Code2 size={14} /> Open in Dev View
                </Button>
              )}
            </div>
            <div className="p-4 pt-2">
              <CodeBlock code={raw.value ?? (raw.loading ? 'Loading…' : 'No raw source for this item.')} syntax={record.meta.syntax} className="max-h-96 rounded-md" />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
