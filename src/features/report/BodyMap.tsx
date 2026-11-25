import type { KeyboardEvent, ReactNode } from 'react';
import { BODY_SYSTEMS } from '@/domain/bodySystems';
import type { ZoneSummary, ZoneTone } from '@/domain/selectors';
import type { BodySystem } from '@/domain/types';
import { cx } from '@/lib/browser';

const TONE_COLOR: Record<ZoneTone, string> = {
  none: 'var(--mv-border)',
  normal: 'var(--mv-accent)',
  attention: 'var(--mv-warn)',
  abnormal: 'var(--mv-crit)',
};
const TONE_LABEL: Record<ZoneTone, string> = { none: 'no records', normal: 'normal records', attention: 'active condition', abnormal: 'abnormal results' };

/** The eight clickable zones, drawn on a 200×420 silhouette. */
const ZONE_SHAPES: Record<Exclude<BodySystem, 'general'>, ReactNode> = {
  neuro: <path d="M100 16c-13 0-22 8-22 19 0 9 7 16 14 17h16c7-1 14-8 14-17 0-11-9-19-22-19z" />,
  endocrine: <path d="M92 80c-5-2-8 1-7 5s5 6 9 4l6-3 6 3c4 2 8 0 9-4s-2-7-7-5l-8 3z" />,
  respiratory: (
    <>
      <path d="M92 104c-12 2-20 14-21 30-1 10 2 14 8 13 9-1 14-6 14-16z" />
      <path d="M108 104c12 2 20 14 21 30 1 10-2 14-8 13-9-1-14-6-14-16z" />
    </>
  ),
  cardio: <path d="M104 126c-4-6-13-4-13 3 0 6 7 11 13 16 6-5 13-10 13-16 0-7-9-9-13-3z" />,
  gi: <path d="M72 158c10-6 32-6 44-1 6 3 6 10 0 14-8 5-20 3-28 8-7 4-14 1-17-6-2-6-2-12 1-15z" />,
  renal: (
    <>
      <path d="M80 190c-6 0-9 5-9 11s3 11 9 11c4 0 5-3 4-6-1-3-1-7 0-10 1-3 0-6-4-6z" />
      <path d="M120 190c6 0 9 5 9 11s-3 11-9 11c-4 0-5-3-4-6 1-3 1-7 0-10-1-3 0-6 4-6z" />
    </>
  ),
  blood: <path d="M38 176c-6 9-10 15-10 21a10 10 0 0 0 20 0c0-6-4-12-10-21z" />,
  musculoskeletal: (
    <>
      <circle cx="82" cy="322" r="10" />
      <circle cx="118" cy="322" r="10" />
      <circle cx="60" cy="102" r="8" />
      <circle cx="140" cy="102" r="8" />
    </>
  ),
};

const SILHOUETTE =
  'M100 8c-16 0-27 11-27 26 0 10 5 18 12 23v9c0 5-4 8-10 10l-14 5c-10 4-15 12-16 22l-8 62c-2 12-6 26-7 38-1 6 3 10 8 10s8-3 9-9l12-70 4-18 2 44c0 16-3 30-4 46l-4 70c-2 30 2 60 4 90l2 26c0 6-2 10-8 14-5 4-3 9 3 9h20c5 0 7-3 7-8l3-116c0-10 3-16 8-16h2c5 0 8 6 8 16l3 116c0 5 2 8 7 8h20c6 0 8-5 3-9-6-4-8-8-8-14l2-26c2-30 6-60 4-90l-4-70c-1-16-4-30-4-46l2-44 4 18 12 70c1 6 4 9 9 9s9-4 8-10c-1-12-5-26-7-38l-8-62c-1-10-6-18-16-22l-14-5c-6-2-10-5-10-10v-9c7-5 12-13 12-23 0-15-11-26-27-26z';

interface BodyMapProps {
  zones: Partial<Record<BodySystem, ZoneSummary>>;
  selected?: BodySystem;
  onSelect(system: BodySystem | undefined): void;
  /** Print snapshots render the figure only, without controls. */
  interactive?: boolean;
}

export function BodyMap({ zones, selected, onSelect, interactive = true }: BodyMapProps) {
  const toggle = (system: BodySystem) => onSelect(selected === system ? undefined : system);
  const onKey = (system: BodySystem) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle(system);
    }
  };

  return (
    <div className="flex items-start gap-4">
      <svg viewBox="0 0 200 420" className="h-72 w-auto shrink-0" role="group" aria-label="Body map">
        <path d={SILHOUETTE} fill="var(--mv-sunken)" stroke="var(--mv-border)" strokeWidth="1.5" />
        {(Object.keys(ZONE_SHAPES) as Array<keyof typeof ZONE_SHAPES>).map((system) => {
          const zone = zones[system];
          const tone = zone?.tone ?? 'none';
          const active = tone !== 'none';
          const info = BODY_SYSTEMS.find((s) => s.id === system)!;
          return (
            <g
              key={system}
              data-zone={system}
              data-tone={tone}
              data-selected={selected === system}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive && active ? 0 : undefined}
              aria-pressed={interactive ? selected === system : undefined}
              aria-label={`${info.label}: ${zone?.count ?? 0} records, ${TONE_LABEL[tone]}`}
              onClick={interactive && active ? () => toggle(system) : undefined}
              onKeyDown={interactive && active ? onKey(system) : undefined}
              fill={TONE_COLOR[tone]}
              fillOpacity={active ? (selected === system ? 0.95 : 0.7) : 0.5}
              stroke={selected === system ? 'var(--mv-text)' : TONE_COLOR[tone]}
              strokeWidth={selected === system ? 2 : 1}
              className={cx('outline-none', interactive && active && 'cursor-pointer hover:animate-[mv-zone-pulse_1.2s_ease-in-out_infinite] focus-visible:stroke-(--mv-text)')}
            >
              <title>{`${info.label} — ${zone?.count ?? 0} records`}</title>
              {ZONE_SHAPES[system]}
            </g>
          );
        })}
      </svg>

      <ul className="min-w-0 flex-1 space-y-0.5 text-[13px]">
        {BODY_SYSTEMS.map((system) => {
          const zone = zones[system.id];
          if (!zone) return null;
          const content = (
            <>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: TONE_COLOR[zone.tone] }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-left">{system.label}</span>
              <span className="tnum text-muted">{zone.count}</span>
            </>
          );
          return (
            <li key={system.id}>
              {interactive ? (
                <button
                  type="button"
                  data-testid={`zone-${system.id}`}
                  aria-pressed={selected === system.id}
                  onClick={() => toggle(system.id)}
                  className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1 hover:bg-sunken', selected === system.id && 'bg-accent-tint font-semibold text-accent-strong')}
                >
                  {content}
                </button>
              ) : (
                <span className="flex items-center gap-2 px-2 py-0.5">{content}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
