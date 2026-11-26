import { Building2, FlaskConical, Stethoscope, Syringe, Wrench } from 'lucide-react';
import { Card } from '@/components/Card';
import { t } from '@/i18n';
import { formatDate } from '@/i18n/format';
import type { TimelineEvent } from '@/domain/selectors';

const ICONS: Record<TimelineEvent['kind'], typeof Stethoscope> = {
  visit: Stethoscope,
  hospital: Building2,
  procedure: Wrench,
  immunization: Syringe,
  labs: FlaskConical,
};

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return null;
  return (
    <Card id="timeline" title={t('timeline.title')} aside={t('timeline.events', { count: events.length })}>
      <ol className="relative ms-2 border-s border-line">
        {events.map((event) => {
          const Icon = ICONS[event.kind];
          return (
            <li key={event.id} className="relative pb-4 ps-6 last:pb-0">
              <span className="absolute top-0 -start-3 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-accent-strong">
                <Icon size={13} aria-hidden="true" />
              </span>
              <p className="tnum text-xs font-medium text-muted">{formatDate(event.date, true)}</p>
              <p className="text-sm font-medium text-ink" dir="auto">
                {event.title}
              </p>
              {event.detail && <p className="text-xs text-muted">{event.detail}</p>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
