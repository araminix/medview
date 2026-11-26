import type { ReactNode } from 'react';
import { digits } from '@/i18n';
import { cx } from '@/lib/browser';

interface CardProps {
  id?: string;
  title?: ReactNode;
  /** Small count or note shown next to the title. */
  aside?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}

/** A report section: white clinical surface with a quiet header. */
export function Card({ id, title, aside, actions, children, className, flush }: CardProps) {
  return (
    <section id={id} className={cx('scroll-mt-4 rounded-lg border border-line bg-surface', className)}>
      {title && (
        <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {aside !== undefined && aside !== null && aside !== false && <span className="tnum text-xs text-muted">{typeof aside === 'number' ? digits(aside) : aside}</span>}
          {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-muted">{children}</p>;
}
