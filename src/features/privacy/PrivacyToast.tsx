import { X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/app/store';
import { preferences } from '@/lib/preferences';
import { t } from '@/i18n';

/** A quiet first-visit note instead of a cookie wall. Remembered with a single non-sensitive flag. */
export function PrivacyToast() {
  const openModal = useApp((state) => state.openModal);
  const [visible, setVisible] = useState(() => !preferences.privacyNoteSeen());
  if (!visible) return null;

  const dismiss = () => {
    preferences.markPrivacyNoteSeen();
    setVisible(false);
  };

  return (
    <div data-testid="privacy-toast" className="no-print fixed bottom-4 start-4 z-30 flex max-w-sm items-center gap-2 rounded-lg border border-line bg-surface py-2 pe-2 ps-3.5 text-[13px] text-ink shadow-lg">
      <span>
        <strong className="font-semibold">{t('toast.lead')}</strong> {t('toast.text')}
      </span>
      <button
        type="button"
        onClick={() => {
          dismiss();
          openModal('privacy');
        }}
        className="font-semibold whitespace-nowrap text-accent-strong hover:underline"
      >
        {t('toast.verify')}
      </button>
      <button type="button" onClick={dismiss} aria-label={t('toast.dismiss')} className="rounded p-1 text-muted hover:text-ink">
        <X size={14} />
      </button>
    </div>
  );
}
