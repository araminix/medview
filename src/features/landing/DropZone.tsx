import { ClipboardPaste, FileUp } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/Button';
import { cx } from '@/lib/browser';
import { t } from '@/i18n';

const EXTENSIONS = '.json · .xml · .hl7 · .txt · .ccda · .zip';
const ACCEPT = '.json,.xml,.hl7,.txt,.ccda,.cda,.zip,application/json,text/xml,text/plain,application/zip';

export function DropZone() {
  const openFile = useApp((state) => state.openFile);
  const openText = useApp((state) => state.openText);
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void openFile(file);
  };

  return (
    <div className="w-full">
      <div
        data-testid="drop-zone"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          'rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragging ? 'border-accent bg-accent-tint' : 'border-accent/50 bg-accent-wash',
        )}
      >
        {pasting ? (
          <div className="mx-auto max-w-2xl text-start">
            <label htmlFor="paste-area" className="text-sm font-medium text-ink">
              {t('drop.pasteLabel')}
            </label>
            <textarea
              id="paste-area"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              spellCheck={false}
              autoFocus
              placeholder={'MSH|^~\\&|LAB|…   or   { "resourceType": "Bundle", … }'}
              dir="ltr"
              className="mt-2 h-40 w-full resize-y rounded-md border border-line bg-surface p-3 font-mono text-xs text-ink"
            />
            <div className="mt-3 flex gap-2">
              <Button variant="primary" disabled={!pasted.trim()} onClick={() => void openText(pasted, 'pasted-text.txt')}>
                {t('drop.open')}
              </Button>
              <Button variant="ghost" onClick={() => setPasting(false)}>
                {t('drop.back')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <FileUp size={32} className="mx-auto text-accent-strong" aria-hidden="true" />
            <p className="mt-3 text-base font-semibold text-ink">{t('drop.title')}</p>
            <p className="mt-1 text-sm text-muted">
              <bdi dir="ltr">{EXTENSIONS}</bdi> — {t('drop.hint')}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => input.current?.click()}>
                {t('drop.choose')}
              </Button>
              <Button onClick={() => setPasting(true)}>
                <ClipboardPaste size={15} /> {t('drop.paste')}
              </Button>
            </div>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          data-testid="file-input"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void openFile(file);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
