import { Building2, FlaskConical, Stethoscope, Syringe, Wrench } from 'lucide-react';
import { Card } from '@/components/Card';
import { formatDate } from '@/domain/dates';
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
    <Card id="timeline" title="Medical timeline" aside={`${events.length} events`}>
      <ol className="relative ml-2 border-l border-line">
        {events.map((event) => {
          const Icon = ICONS[event.kind];
          return (
            <li key={event.id} className="relative pb-4 pl-6 last:pb-0">
              <span className="absolute top-0 -left-3 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-accent-strong">
                <Icon size={13} aria-hidden="true" />
              </span>
              <p className="tnum text-xs font-medium text-muted">{formatDate(event.date, true)}</p>
              <p className="text-sm font-medium text-ink">{event.title}</p>
              {event.detail && <p className="text-xs text-muted">{event.detail}</p>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
