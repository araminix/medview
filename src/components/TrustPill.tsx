import { ShieldCheck, WifiOff } from 'lucide-react';
import { useApp } from '@/app/store';
import { useOnline } from '@/lib/useOnline';
import { t } from '@/i18n';

/** The always-visible privacy promise. Clicking it opens the proof. */
export function TrustPill({ short = false }: { short?: boolean }) {
  const online = useOnline();
  const openModal = useApp((state) => state.openModal);
  const label = online ? t(short ? 'trust.ready' : 'trust.local') : t('trust.verified');
  return (
    <button
      type="button"
      onClick={() => openModal('privacy')}
      data-testid="trust-pill"
      title={t('trust.title')}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ok-bg px-3 text-xs font-semibold whitespace-nowrap text-ok-text hover:brightness-95"
    >
      {online ? <ShieldCheck size={14} /> : <WifiOff size={14} />}
      {label}
    </button>
  );
}
