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

/** Sort helper: newest first, undated last. */
export function byDateDesc<T>(pick: (item: T) => string | undefined) {
  return (a: T, b: T) => (pick(b) ?? '').localeCompare(pick(a) ?? '');
}
