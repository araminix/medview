import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cx } from '@/lib/browser';
import { t } from '@/i18n';

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

const SIZES = { md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

/** Native <dialog> gives focus trapping, Escape handling and the inert backdrop for free. */
export function Modal({ title, subtitle, onClose, children, footer, size = 'lg' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cx(
        'no-print m-auto max-h-[92vh] w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-slate-900/50',
        SIZES[size],
      )}
    >
      <div className="flex max-h-[92vh] flex-col">
        <header className="flex items-start gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="ms-auto rounded-md p-1.5 text-muted hover:bg-sunken hover:text-ink">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas px-5 py-3">{footer}</footer>}
      </div>
    </dialog>
  );
}
