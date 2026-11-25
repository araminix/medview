import { Check, ClipboardCopy, Download, EyeOff, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Modal } from '@/components/Modal';
import { engine } from '@/engine/client';
import { copyText, downloadBlob } from '@/lib/browser';
import { useAsync } from '@/lib/useAsync';
import type { PiiCategory, ScrubChange, ScrubOptions } from '@/scrubber';

const OPTIONS: Array<{ key: keyof ScrubOptions; label: string; hint: string }> = [
  { key: 'names', label: 'Replace patient & relative names', hint: 'John Doe → Patient Alpha' },
  { key: 'birthDate', label: 'Mask birth date', hint: 'Keeps the year, so age stays clinically valid' },
  { key: 'ids', label: 'Replace IDs', hint: 'MRN, SSN, insurance and national IDs → synthetic hash' },
  { key: 'contacts', label: 'Strip contact info', hint: 'Phone, e-mail and street address → [REDACTED]' },
  { key: 'providers', label: 'Mask doctor, hospital & organization names', hint: 'Optional — turn off to keep care-team context' },
];

const CATEGORY_LABEL: Record<PiiCategory, string> = { name: 'Name', birthDate: 'Birth date', id: 'Identifier', contact: 'Contact', provider: 'Provider' };

const MIME: Record<string, string> = { json: 'application/json', xml: 'application/xml', hl7: 'text/plain' };

/** Inserts ".scrubbed" before the extension: report.json → report.scrubbed.json */
function scrubbedName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)}.scrubbed${name.slice(dot)}` : `${name}.scrubbed`;
}

function DiffPreview({ changes, loading }: { changes: ScrubChange[]; loading: boolean }) {
  if (!loading && changes.length === 0) {
    return <p className="p-6 text-center text-sm text-muted">Nothing to replace with the current selection.</p>;
  }
  return (
    <table className="w-full border-collapse text-left text-[13px]" data-testid="scrub-diff" aria-busy={loading}>
      <thead>
        <tr className="text-xs text-muted">
          <th className="px-3 py-1.5 font-medium">Type</th>
          <th className="px-3 py-1.5 font-medium">Original</th>
          <th className="px-3 py-1.5 font-medium">Becomes</th>
          <th className="px-3 py-1.5 text-right font-medium">Found</th>
        </tr>
      </thead>
      <tbody>
        {changes.slice(0, 300).map((change) => (
          <tr key={`${change.category}-${change.original}`} className="border-t border-line">
            <td className="px-3 py-1.5 whitespace-nowrap text-muted">{CATEGORY_LABEL[change.category]}</td>
            <td className="px-3 py-1.5 font-mono text-xs break-all text-crit-text line-through decoration-crit/60">{change.original}</td>
            <td className="px-3 py-1.5 font-mono text-xs break-all text-ok-text">{change.replacement}</td>
            <td className="tnum px-3 py-1.5 text-right text-muted">{change.count}×</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ScrubberModal({ onClose }: { onClose(): void }) {
  const file = useApp((state) => state.file);
  const record = useApp((state) => state.record);
  const scrubbed = useApp((state) => state.scrubbed);
  const applyScrub = useApp((state) => state.applyScrub);
  const revertScrub = useApp((state) => state.revertScrub);
  const [options, setOptions] = useState(useApp.getState().scrubOptions);
  const [copied, setCopied] = useState(false);
  const preview = useAsync(options, () => engine.call('previewScrub', options));
  const changes = preview.value ?? [];
  const loading = preview.loading;

  const total = changes.reduce((sum, change) => sum + change.count, 0);

  const download = async () => {
    const text = await engine.call('scrubbedText', options);
    downloadBlob(text, scrubbedName(file?.name ?? 'medical-file'), MIME[record?.meta.syntax ?? 'hl7']);
  };

  const copySummary = async () => {
    setCopied(await copyText(await engine.call('safeSummary', options)));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      title="Hide private info"
      subtitle="Anonymize this file on your device. Lab values, units, medications and diagnosis codes stay untouched."
      onClose={onClose}
      footer={
        <>
          {scrubbed && (
            <Button
              variant="ghost"
              className="mr-auto"
              data-testid="scrub-revert"
              onClick={() => {
                void revertScrub().then(onClose);
              }}
            >
              <Undo2 size={15} /> Show original again
            </Button>
          )}
          <Button onClick={() => void copySummary()} data-testid="scrub-copy">
            {copied ? <Check size={15} /> : <ClipboardCopy size={15} />} {copied ? 'Copied' : 'Copy safe summary for AI / support'}
          </Button>
          <Button onClick={() => void download()} data-testid="scrub-download">
            <Download size={15} /> Download scrubbed file
          </Button>
          <Button
            variant="primary"
            data-testid="scrub-apply"
            onClick={() => {
              void applyScrub(options).then(onClose);
            }}
          >
            <EyeOff size={15} /> Apply to current view
          </Button>
        </>
      }
    >
      <div className="grid md:grid-cols-[18rem_minmax(0,1fr)]" data-testid="scrubber-modal">
        <fieldset className="border-b border-line p-3 md:border-r md:border-b-0">
          <legend className="sr-only">What to anonymize</legend>
          {OPTIONS.map((option) => (
            <Checkbox
              key={option.key}
              checked={options[option.key]}
              onChange={(checked) => setOptions({ ...options, [option.key]: checked })}
              label={option.label}
              hint={option.hint}
            />
          ))}
        </fieldset>
        <div className="min-h-64">
          <p className="border-b border-line bg-canvas px-3 py-2 text-xs text-muted" aria-live="polite">
            {loading ? 'Scanning the file…' : `${total} replacement${total === 1 ? '' : 's'} across ${changes.length} distinct value${changes.length === 1 ? '' : 's'}`}
          </p>
          <DiffPreview changes={changes} loading={loading} />
        </div>
      </div>
    </Modal>
  );
}
