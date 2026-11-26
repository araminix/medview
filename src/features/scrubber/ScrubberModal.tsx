import { Check, ClipboardCopy, Download, EyeOff, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Modal } from '@/components/Modal';
import { engine } from '@/engine/client';
import { copyText, downloadBlob } from '@/lib/browser';
import { useAsync } from '@/lib/useAsync';
import type { ScrubChange, ScrubOptions } from '@/scrubber';
import { digits, t } from '@/i18n';

const OPTIONS: Array<keyof ScrubOptions> = ['names', 'birthDate', 'ids', 'contacts', 'providers'];

const MIME: Record<string, string> = { json: 'application/json', xml: 'application/xml', hl7: 'text/plain' };

/**
 * Inserts ".scrubbed" before the extension: report.json → report.scrubbed.json. A file MedView converted
 * on opening (an Apple Health export becomes FHIR JSON) takes the extension of what is downloaded.
 */
function scrubbedName(name: string, syntax?: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  const converted = syntax === 'json' && !/\.(json|txt)$/i.test(extension);
  return `${base}.scrubbed${converted ? '.json' : extension}`;
}

function DiffPreview({ changes, loading }: { changes: ScrubChange[]; loading: boolean }) {
  if (!loading && changes.length === 0) {
    return <p className="p-6 text-center text-sm text-muted">{t('scrub.nothing')}</p>;
  }
  return (
    <table className="w-full border-collapse text-start text-[13px]" data-testid="scrub-diff" aria-busy={loading}>
      <thead>
        <tr className="text-xs text-muted">
          <th className="px-3 py-1.5 font-medium">{t('scrub.col.type')}</th>
          <th className="px-3 py-1.5 font-medium">{t('scrub.col.original')}</th>
          <th className="px-3 py-1.5 font-medium">{t('scrub.col.becomes')}</th>
          <th className="px-3 py-1.5 text-end font-medium">{t('scrub.col.found')}</th>
        </tr>
      </thead>
      <tbody>
        {changes.slice(0, 300).map((change) => (
          <tr key={`${change.category}-${change.original}`} className="border-t border-line">
            <td className="px-3 py-1.5 whitespace-nowrap text-muted">{t(`scrub.cat.${change.category}`)}</td>
            <td dir="auto" className="px-3 py-1.5 font-mono text-xs break-all text-crit-text line-through decoration-crit/60">
              {change.original}
            </td>
            <td dir="ltr" className="px-3 py-1.5 text-start font-mono text-xs break-all text-ok-text">
              {change.replacement}
            </td>
            <td className="tnum px-3 py-1.5 text-end text-muted">{digits(change.count)}×</td>
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
    downloadBlob(text, scrubbedName(file?.name ?? 'medical-file', record?.meta.syntax), MIME[record?.meta.syntax ?? 'hl7']);
  };

  const copySummary = async () => {
    setCopied(await copyText(await engine.call('safeSummary', options)));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      title={t('scrub.title')}
      subtitle={t('scrub.subtitle')}
      onClose={onClose}
      footer={
        <>
          {scrubbed && (
            <Button
              variant="ghost"
              className="me-auto"
              data-testid="scrub-revert"
              onClick={() => {
                void revertScrub().then(onClose);
              }}
            >
              <Undo2 size={15} /> {t('scrub.revert')}
            </Button>
          )}
          <Button onClick={() => void copySummary()} data-testid="scrub-copy">
            {copied ? <Check size={15} /> : <ClipboardCopy size={15} />} {copied ? t('common.copied') : t('scrub.copy')}
          </Button>
          <Button onClick={() => void download()} data-testid="scrub-download">
            <Download size={15} /> {t('scrub.download')}
          </Button>
          <Button
            variant="primary"
            data-testid="scrub-apply"
            onClick={() => {
              void applyScrub(options).then(onClose);
            }}
          >
            <EyeOff size={15} /> {t('scrub.apply')}
          </Button>
        </>
      }
    >
      <div className="grid md:grid-cols-[18rem_minmax(0,1fr)]" data-testid="scrubber-modal">
        <fieldset className="border-b border-line p-3 md:border-e md:border-b-0">
          <legend className="sr-only">{t('scrub.legend')}</legend>
          {OPTIONS.map((option) => (
            <Checkbox
              key={option}
              checked={options[option]}
              onChange={(checked) => setOptions({ ...options, [option]: checked })}
              label={t(`scrub.${option}`)}
              hint={t(`scrub.${option}Hint`)}
            />
          ))}
        </fieldset>
        <div className="min-h-64">
          <p className="border-b border-line bg-canvas px-3 py-2 text-xs text-muted" aria-live="polite">
            {loading ? t('scrub.scanning') : t('scrub.count', { total, values: changes.length })}
          </p>
          <DiffPreview changes={changes} loading={loading} />
        </div>
      </div>
    </Modal>
  );
}
