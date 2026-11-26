import { t } from '@/i18n';
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 64 64" className="size-7 shrink-0" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="var(--mv-accent-strong)" />
        <path d="M12 34h10l5-14 8 26 6-18 3 6h8" fill="none" stroke="var(--mv-on-accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-ink">
        MedView{!compact && <span className="ms-1.5 font-normal text-muted">{t('logo.by')}</span>}
      </span>
    </span>
  );
}
