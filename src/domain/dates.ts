/** Dates are normalized to partial ISO strings: YYYY, YYYY-MM, YYYY-MM-DD or YYYY-MM-DDTHH:mm. */

const ISO = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:[T ](\d{2}):(\d{2}))?)?)?/;
const COMPACT = /^(\d{4})(\d{2})?(\d{2})?(?:(\d{2})(\d{2}))?/;

function assemble(parts: Array<string | undefined>): string | undefined {
  const [y, mo, d, h, mi] = parts;
  if (!y) return undefined;
  const year = Number(y);
  if (year < 1800 || year > 2200) return undefined;
  if (!mo) return y;
  const month = Number(mo);
  if (month < 1 || month > 12) return undefined;
  if (!d) return `${y}-${mo}`;
  const day = Number(d);
  if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return undefined;
  const date = `${y}-${mo}-${d}`;
  if (!h || !mi || Number(h) > 23 || Number(mi) > 59) return date;
  return `${date}T${h}:${mi}`;
}

/** Accepts ISO 8601 (FHIR) and compact HL7 timestamps (YYYYMMDDHHMM…). Returns undefined when invalid. */
export function normalizeDate(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const text = input.trim();
  if (!text) return undefined;
  const match = text.includes('-') ? ISO.exec(text) : COMPACT.exec(text);
  return match ? assemble(match.slice(1)) : undefined;
}

export function calcAge(dob: string | undefined, now = new Date()): number | undefined {
  if (!dob) return undefined;
  const [y, m = '01', d = '01'] = dob.slice(0, 10).split('-');
  const birth = new Date(Number(y), Number(m) - 1, Number(d));
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 150 ? age : undefined;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2025-03-14T09:30" → "14 Mar 2025, 09:30". Partial dates stay partial. */
export function formatDate(iso: string | undefined, withTime = false): string {
  if (!iso) return '—';
  const [date, time] = iso.split('T');
  const [y, m, d] = date.split('-');
  if (!m) return y;
  const month = MONTHS[Number(m) - 1];
  if (!d) return `${month} ${y}`;
  const base = `${Number(d)} ${month} ${y}`;
  return withTime && time ? `${base}, ${time}` : base;
}

/** Sort helper: newest first, undated last. */
export function byDateDesc<T>(pick: (item: T) => string | undefined) {
  return (a: T, b: T) => (pick(b) ?? '').localeCompare(pick(a) ?? '');
}

/** How long ago a date was, in everyday words: "3 days ago", "5 months ago", "over 2 years ago". */
export function describeAge(iso: string | undefined, now = new Date()): string | undefined {
  if (!iso) return undefined;
  const [y, m = '01', d = '01'] = iso.slice(0, 10).split('-');
  const days = Math.floor((now.getTime() - new Date(Number(y), Number(m) - 1, Number(d)).getTime()) / 86_400_000);
  if (days < 0) return undefined;
  if (days === 0) return 'today';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? 'over a year ago' : `over ${years} years ago`;
}

export function daysSince(iso: string | undefined, now = new Date()): number | undefined {
  if (!iso) return undefined;
  const [y, m = '01', d = '01'] = iso.slice(0, 10).split('-');
  return Math.floor((now.getTime() - new Date(Number(y), Number(m) - 1, Number(d)).getTime()) / 86_400_000);
}
