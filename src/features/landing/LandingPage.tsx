import { AlertTriangle, FlaskConical, Star, X } from 'lucide-react';
import { useApp } from '@/app/store';
import { LanguageMenu } from '@/components/LanguageMenu';
import { Logo } from '@/components/Logo';
import { Pill } from '@/components/Pill';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TrustPill } from '@/components/TrustPill';
import { cx } from '@/lib/browser';
import { useOnline } from '@/lib/useOnline';
import { SAMPLES } from '@/samples';
import { DropZone } from './DropZone';
import { LoadingPanel } from './LoadingPanel';
import { t } from '@/i18n';
import { translateError } from '@/i18n/errors';

export const REPO_URL = 'https://github.com/araminix/medview';
const ACTIVE_FORMATS = ['FHIR R4/R5', 'HL7 v2', 'US C-CDA', 'EU IPS', 'Apple Health', 'openEHR'];
const PLANNED_FORMATS = ['DICOM'];

function ErrorBanner() {
  const error = useApp((state) => state.error);
  const dismissError = useApp((state) => state.dismissError);
  if (!error) return null;
  return (
    <div role="alert" data-testid="error-banner" className="flex items-start gap-3 rounded-lg border border-crit/30 bg-crit-bg px-4 py-3">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-crit" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-crit-text">{translateError(error.message)}</p>
        {error.hint && <p className="mt-0.5 text-ink">{translateError(error.hint)}</p>}
        <p className="mt-0.5 text-muted">{t('error.nothingUploaded')}</p>
      </div>
      <button type="button" onClick={dismissError} aria-label={t('common.dismiss')} className="ms-auto rounded p-1 text-muted hover:text-ink">
        <X size={16} />
      </button>
    </div>
  );
}

function TrustChallenge() {
  const online = useOnline();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
      <span
        data-testid="network-status"
        className={cx('inline-flex items-center gap-1.5 font-semibold', online ? 'text-muted' : 'text-ok-text')}
      >
        <span className={cx('size-2 rounded-full', online ? 'bg-muted' : 'bg-ok')} aria-hidden="true" />
        {online ? t('landing.online') : t('trust.verified')}
      </span>
      <span className="text-ink">
        {online ? t('landing.challengeOnline') : t('landing.challengeOffline')}
      </span>
    </div>
  );
}

export function LandingPage() {
  const status = useApp((state) => state.status);
  const openText = useApp((state) => state.openText);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <Logo />
        <div className="ms-auto flex items-center gap-1.5">
          <TrustPill />
          <LanguageMenu />
          <ThemeToggle />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted hover:bg-sunken hover:text-ink"
          >
            <Star size={16} /> <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-10 sm:py-14">
        <div className="text-center">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance text-ink sm:text-4xl">
            {t('landing.title')}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted">
            {t('landing.lead')}
          </p>
        </div>

        <ErrorBanner />
        {status === 'loading' ? <LoadingPanel /> : <DropZone />}

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
            <FlaskConical size={13} /> {t('landing.samples')}
          </p>
          <div className="flex flex-wrap gap-2">
            {SAMPLES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                disabled={status === 'loading'}
                data-testid={`sample-${sample.id}`}
                onClick={() => void openText(sample.content, sample.fileName)}
                className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-accent-strong hover:border-accent hover:bg-accent-wash disabled:opacity-50"
              >
                {t(`landing.sample.${sample.id}`)}
              </button>
            ))}
          </div>
        </div>

        <TrustChallenge />

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-semibold tracking-wide uppercase">{t('landing.formats')}</span>
          {ACTIVE_FORMATS.map((format) => (
            <Pill key={format} tone="accent">
              {format}
            </Pill>
          ))}
          {PLANNED_FORMATS.map((format) => (
            <Pill key={format} title={t('landing.soonTitle')}>
              {t('landing.soon', { format })}
            </Pill>
          ))}
        </div>
      </main>

      <footer className="border-t border-line px-6 py-4 text-center text-xs text-muted">
        {t('landing.footer')}
      </footer>
    </div>
  );
}
