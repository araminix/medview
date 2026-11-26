import { Check, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/Modal';
import { cx } from '@/lib/browser';
import { useOnline } from '@/lib/useOnline';
import { t, tList } from '@/i18n';
import { REPO_URL } from '../landing/LandingPage';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Flips to emerald the instant the browser loses its connection — while the app keeps working. */
function AirplaneProof() {
  const online = useOnline();
  return (
    <div
      data-testid="offline-proof"
      data-online={online}
      aria-live="polite"
      className={cx('flex items-start gap-3 rounded-lg border p-4', online ? 'border-line bg-canvas' : 'border-ok bg-ok-bg')}
    >
      {online ? <Wifi size={20} className="mt-0.5 shrink-0 text-muted" /> : <WifiOff size={20} className="mt-0.5 shrink-0 text-ok" />}
      {online ? (
        <p className="text-sm text-ink">
          <strong className="font-semibold">{t('privacy.proofLead')}</strong> {t('privacy.proofOnline')}
        </p>
      ) : (
        <p className="text-sm font-semibold text-ok-text">{t('privacy.proofOffline')}</p>
      )}
    </div>
  );
}

export function PrivacyModal({ onClose }: { onClose(): void }) {
  return (
    <Modal title={t('privacy.title')} subtitle={t('privacy.subtitle')} onClose={onClose} size="md">
      <div className="space-y-5 p-5" data-testid="privacy-modal">
        <Block title={t('privacy.policyTitle')}>
          <ul className="space-y-1.5 text-sm text-ink">
            {tList('privacy.policy').map((line) => (
              <li key={line} className="flex gap-2">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" /> {line}
              </li>
            ))}
            <li className="flex gap-2">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" />
              <span>
                {t('privacy.source')}{' '}
                <a href={REPO_URL} target="_blank" rel="noreferrer" dir="ltr" className="font-medium text-accent-strong underline">
                  github.com/araminix/medview
                </a>
                .
              </span>
            </li>
          </ul>
        </Block>

        <Block title={t('privacy.proofTitle')}>
          <AirplaneProof />
        </Block>

        <Block title={t('privacy.guaranteesTitle')}>
          <ul className="grid gap-1.5 text-sm text-ink sm:grid-cols-2">
            {tList('privacy.guarantees').map((line) => (
              <li key={line} className="flex gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-ok" /> {line}
              </li>
            ))}
          </ul>
        </Block>

        <Block title={t('privacy.verifyTitle')}>
          <ol className="list-decimal space-y-1 ps-5 text-sm text-ink">
            {tList('privacy.verifySteps').map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Block>
      </div>
    </Modal>
  );
}
