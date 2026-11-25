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

const TOGGLES: Array<{ key: keyof PrintOptions; label: string; indent?: boolean }> = [
  { key: 'header', label: 'Patient header & allergies' },
  { key: 'labs', label: 'Laboratory results' },
  { key: 'abnormalOnly', label: 'Abnormal labs only', indent: true },
  { key: 'medications', label: 'Active medications' },
  { key: 'conditions', label: 'Active conditions / diagnoses' },
  { key: 'bodyMap', label: 'Clinical body map snapshot' },
  { key: 'timeline', label: 'Historical visits timeline' },
  { key: 'anonymize', label: 'Anonymize patient info before printing' },
];

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
      title="Print / save as PDF"
      subtitle="Choose what goes on paper. Choose “Save as PDF” in the print dialog to keep a file."
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={() => setPrinting(true)} data-testid="print-now">
            <Printer size={15} /> Print / Save as PDF
          </Button>
        </>
      }
    >
      <div className="grid md:grid-cols-[17rem_minmax(0,1fr)]" data-testid="print-modal">
        <fieldset className="border-b border-line p-3 md:border-r md:border-b-0">
          <legend className="sr-only">Sections to print</legend>
          {TOGGLES.map((toggle) => (
            <div key={toggle.key} className={toggle.indent ? 'pl-6' : ''}>
              <Checkbox
                checked={options[toggle.key]}
                disabled={(toggle.key === 'abnormalOnly' && !options.labs) || (toggle.key === 'anonymize' && alreadyScrubbed)}
                onChange={(checked) => setOptions({ ...options, [toggle.key]: checked })}
                label={toggle.label}
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
