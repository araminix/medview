import { Check, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/Modal';
import { cx } from '@/lib/browser';
import { useOnline } from '@/lib/useOnline';
import { REPO_URL } from '../landing/LandingPage';

const POLICY = [
  'Your files never leave your device.',
  'Zero backend servers receive, process, or store your files.',
  'Zero cookies, zero analytics, zero third-party trackers, zero external fonts.',
  'Files live only in temporary browser memory — refreshing or closing the tab erases everything permanently.',
];

const GUARANTEES = [
  'Strict Content-Security-Policy blocking every external connection',
  'Parsing and anonymizing run in a local Web Worker',
  'Zero localStorage / IndexedDB writes for patient data',
  'Reproducible public GitHub Actions deployment',
];

const VERIFY_STEPS = ['Open DevTools (F12) and switch to the Network tab.', 'Drop a file into MedView.', 'Confirm that 0 requests are sent.'];

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
          <strong className="font-semibold">Test it yourself:</strong> disconnect Wi-Fi or enable Airplane Mode right now. This box turns green and everything keeps
          working.
        </p>
      ) : (
        <p className="text-sm font-semibold text-ok-text">✓ OFFLINE VERIFIED — Your browser has no internet and MedView is running 100% locally.</p>
      )}
    </div>
  );
}

export function PrivacyModal({ onClose }: { onClose(): void }) {
  return (
    <Modal title="Privacy & offline proof" subtitle="No cookie wall, no account, nothing to accept. Here is exactly what happens to your file." onClose={onClose} size="md">
      <div className="space-y-5 p-5" data-testid="privacy-modal">
        <Block title="Privacy policy, in plain English">
          <ul className="space-y-1.5 text-sm text-ink">
            {POLICY.map((line) => (
              <li key={line} className="flex gap-2">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" /> {line}
              </li>
            ))}
            <li className="flex gap-2">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" />
              <span>
                The code is open source and publicly auditable at{' '}
                <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-medium text-accent-strong underline">
                  github.com/araminix/medview
                </a>
                .
              </span>
            </li>
          </ul>
        </Block>

        <Block title="Live airplane-mode proof">
          <AirplaneProof />
        </Block>

        <Block title="Technical guarantees">
          <ul className="grid gap-1.5 text-sm text-ink sm:grid-cols-2">
            {GUARANTEES.map((line) => (
              <li key={line} className="flex gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-ok" /> {line}
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Verify it in 10 seconds">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
            {VERIFY_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Block>
      </div>
    </Modal>
  );
}
