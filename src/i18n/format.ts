import type { BodySystem, ClinicalStatus, GraphNodeKind, LabFlag } from '@/domain/types';
import { activeLanguage, activeLocale, digits, t } from '.';

function parts(iso: string): [year: number, month: number | undefined, day: number | undefined] {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return [Number(y), m ? Number(m) : undefined, d ? Number(d) : undefined];
}

/**
 * "2025-03-14T09:30" → "14 Mar 2025, 09:30" in the active language's calendar and digits:
 * Jalali for Persian ("۲۴ اسفند ۱۴۰۳"), Gregorian otherwise. Partial dates stay partial.
 */
export function formatDate(iso: string | undefined, withTime = false): string {
  if (!iso) return '—';
  const [year, month, day] = parts(iso);
  const jalali = activeLanguage() === 'fa';
  // A year or month alone has no exact Jalali equivalent; its midpoint gives the one it mostly falls in.
  if (!month && !jalali) return String(year);
  const date = new Date(Date.UTC(year, (month ?? 7) - 1, day ?? (month ? 15 : 1)));
  // Persian month names have no short forms.
  const monthStyle = jalali ? 'long' : 'short';
  const options: Intl.DateTimeFormatOptions = { timeZone: 'UTC', year: 'numeric', ...(month ? { month: monthStyle } : {}), ...(day ? { day: 'numeric' } : {}) };
  const text = new Intl.DateTimeFormat(activeLocale(), options).format(date);
  const time = iso.split('T')[1];
  return withTime && time ? `${text}${jalali ? '،' : ','} ${digits(time)}` : text;
}

export function daysSince(iso: string | undefined, now = new Date()): number | undefined {
  if (!iso) return undefined;
  const [year, month = 1, day = 1] = parts(iso);
  return Math.floor((now.getTime() - new Date(year, month - 1, day).getTime()) / 86_400_000);
}

/** How long ago a date was, in everyday words: "3 days ago", "5 months ago", "over 2 years ago". */
export function describeAge(iso: string | undefined, now = new Date()): string | undefined {
  const days = daysSince(iso, now);
  if (days === undefined || days < 0) return undefined;
  if (days === 0) return t('age.today');
  if (days < 14) return t('age.days', { count: days });
  if (days < 60) return t('age.weeks', { count: Math.round(days / 7) });
  if (days < 365) return t('age.months', { count: Math.round(days / 30) });
  const years = Math.floor(days / 365);
  return years === 1 ? t('age.year') : t('age.years', { count: years });
}

export function bodySystemLabel(system: BodySystem): string {
  return t(`body.${system}`);
}

export function flagLabel(flag: LabFlag): string {
  return t(`flag.${flag}`);
}

export function statusLabel(status: ClinicalStatus): string {
  return t(`status.${status}`);
}

export function kindLabel(kind: GraphNodeKind): string {
  return t(`graph.kind.${kind}`);
}
