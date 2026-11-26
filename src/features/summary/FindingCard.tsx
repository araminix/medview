import { CircleCheck, MessageCircleQuestion, Siren } from 'lucide-react';
import { t } from '@/i18n';
import { describeAge, daysSince, formatDate } from '@/i18n/format';
import type { Evidence, Finding, Urgency } from '@/domain/guidance/types';
import { cx } from '@/lib/browser';

const URGENCY_STYLE: Record<Urgency, { chip: string; border: string }> = {
  emergency: { chip: 'bg-crit-bg text-crit-text', border: 'border-s-crit' },
  soon: { chip: 'bg-warn-bg text-warn-text', border: 'border-s-warn' },
  routine: { chip: 'bg-accent-tint text-accent-strong', border: 'border-s-accent' },
};

/** Results older than this are probably not the reader's current state. */
const STALE_DAYS = 30;

function EvidenceLine({ item }: { item: Evidence }) {
  const age = describeAge(item.date);
  return (
    <li className="py-1">
      <span className="tnum font-medium text-ink" dir="auto">
        {item.label}
      </span>
      {item.detail && <span className="text-muted"> — {item.detail}</span>}
      {item.date && (
        <span className="tnum block text-[13px] text-muted">
          {formatDate(item.date)}
          {age ? ` · ${age}` : ''}
        </span>
      )}
    </li>
  );
}

function UrgentBox({ finding }: { finding: Finding }) {
  const newest = Math.min(...finding.evidence.map((e) => daysSince(e.date) ?? Infinity));
  const stale = newest > STALE_DAYS;
  return (
    <div className="mt-3 flex gap-3 rounded-lg border border-crit/40 bg-crit-bg p-3" role="alert">
      <Siren size={20} className="mt-0.5 shrink-0 text-crit" aria-hidden="true" />
      <div className="text-[15px] text-crit-text">
        <p className="font-semibold">{finding.urgentReason}</p>
        {stale ? (
          <p className="mt-1">{t('finding.stale')}</p>
        ) : (
          <p className="mt-1">
            {t('finding.freshBefore')} <strong>{t('finding.freshStrong')}</strong>
            {t('common.sentenceEnd')} {t('finding.freshAfter')}
          </p>
        )}
      </div>
    </div>
  );
}

/** One health problem, explained for someone with no medical background. */
export function FindingCard({ finding }: { finding: Finding }) {
  const style = URGENCY_STYLE[finding.urgency];
  return (
    <article data-testid="finding" data-urgency={finding.urgency} data-topic={finding.id} className={cx('rounded-xl border border-s-[6px] border-line bg-surface p-5', style.border)}>
      <span className={cx('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', style.chip)}>{t(`urgency.${finding.urgency}`)}</span>
      <h3 className="mt-2 text-lg leading-snug font-semibold text-ink">{finding.title}</h3>
      <p className="mt-1 text-[15px] text-ink">{finding.meaning}</p>

      {finding.urgency === 'emergency' && <UrgentBox finding={finding} />}

      <h4 className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">{t('finding.shows')}</h4>
      <ul className="mt-1 divide-y divide-line text-[15px]">
        {finding.evidence.map((item) => (
          <EvidenceLine key={item.label} item={item} />
        ))}
      </ul>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{t('finding.selfCare')}</h4>
          <ul className="mt-1.5 space-y-1.5 text-[15px] text-ink">
            {finding.selfCare.map((tip) => (
              <li key={tip} className="flex gap-2">
                <CircleCheck size={17} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" /> <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{t('finding.ask')}</h4>
          <ul className="mt-1.5 space-y-1.5 text-[15px] text-ink">
            {finding.askDoctor.map((question) => (
              <li key={question} className="flex gap-2">
                <MessageCircleQuestion size={17} className="mt-0.5 shrink-0 text-accent-strong" aria-hidden="true" /> <span>{question}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}
