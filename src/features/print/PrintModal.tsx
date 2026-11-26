import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp, useRecord } from '@/app/store';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Modal } from '@/components/Modal';
import type { ClinicalRecord } from '@/domain/types';
import { engine } from '@/engine/client';
import { useAsync } from '@/lib/useAsync';
import { DEFAULT_PRINT_OPTIONS, PrintDocument, type PrintOptions } from './PrintDocument';
import { t } from '@/i18n';

const TOGGLES: Array<keyof PrintOptions> = ['header', 'labs', 'abnormalOnly', 'medications', 'conditions', 'bodyMap', 'timeline', 'anonymize'];

/** The record to print: the anonymized one when requested and not already on screen. */
function usePrintRecord(anonymize: boolean): ClinicalRecord {
  const record = useRecord();
  const alreadyScrubbed = useApp((state) => state.scrubbed);
  const scrubOptions = useApp((state) => state.scrubOptions);
  const needed = anonymize && !alreadyScrubbed;
  const anonymized = useAsync(needed ? scrubOptions : null, () => engine.call('scrubbedRecord', scrubOptions));
  return needed && anonymized.value ? anonymized.value : record;
}

export function PrintModal({ onClose }: { onClose(): void }) {
  const alreadyScrubbed = useApp((state) => state.scrubbed);
  const [options, setOptions] = useState<PrintOptions>({ ...DEFAULT_PRINT_OPTIONS, anonymize: alreadyScrubbed });
  const [printing, setPrinting] = useState(false);
  const record = usePrintRecord(options.anonymize);

  // Native printing: crisp vector text, works offline, no PDF library.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    document.body.classList.add('mv-printing');
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    return () => {
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('mv-printing');
    };
  }, [printing]);

  return (
    <Modal
      title={t('print.title')}
      subtitle={t('print.subtitle')}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button variant="primary" onClick={() => setPrinting(true)} data-testid="print-now">
            <Printer size={15} /> {t('print.now')}
          </Button>
        </>
      }
    >
      <div className="grid md:grid-cols-[17rem_minmax(0,1fr)]" data-testid="print-modal">
        <fieldset className="border-b border-line p-3 md:border-e md:border-b-0">
          <legend className="sr-only">{t('print.legend')}</legend>
          {TOGGLES.map((toggle) => (
            <div key={toggle} className={toggle === 'abnormalOnly' ? 'ps-6' : ''}>
              <Checkbox
                checked={options[toggle]}
                disabled={(toggle === 'abnormalOnly' && !options.labs) || (toggle === 'anonymize' && alreadyScrubbed)}
                onChange={(checked) => setOptions({ ...options, [toggle]: checked })}
                label={t(`print.${toggle}`)}
              />
            </div>
          ))}
        </fieldset>
        <div className="bg-sunken p-4">
          <div className="mx-auto max-w-[210mm] border border-line shadow-md" data-testid="print-preview">
            <PrintDocument record={record} options={options} />
          </div>
        </div>
      </div>
      {printing && createPortal(<PrintDocument record={record} options={options} />, document.getElementById('print-root')!)}
    </Modal>
  );
}
