import type { ReactNode } from 'react';
import { cx } from '@/lib/browser';

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'crit';

const TONES: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted border-line',
  accent: 'bg-accent-tint text-accent-strong border-transparent',
  ok: 'bg-ok-bg text-ok-text border-transparent',
  warn: 'bg-warn-bg text-warn-text border-transparent',
  crit: 'bg-crit-bg text-crit-text border-transparent',
};

export function Pill({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone], className)}>
      {children}
    </span>
  );
}
