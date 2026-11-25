import { normalizeDate } from '@/domain/dates';
import { REDACTED, type PiiCategory, type PiiEntry, type ScrubOptions } from './types';

const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Sigma', 'Omega'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ROLE_LABEL = { patient: 'Patient', relative: 'Relative', provider: 'Doctor' } as const;

export type PersonRole = keyof typeof ROLE_LABEL;

export interface NameParts {
  given?: Array<string | undefined>;
  family?: Array<string | undefined>;
  /** Used when the name only exists as one string ("Ada M. Example"). */
  text?: string;
}

/** Deterministic, non-reversible stand-in for an identifier (FNV-1a). */
export function syntheticId(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `ID-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

function tokens(values: Array<string | undefined>): string[] {
  return values.flatMap((value) => (value ?? '').split(/[\s,]+/)).map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter((t) => t.length >= 2);
}

const TITLES = /^(dr|mr|mrs|ms|miss|prof|md|phd|rn|jr|sr|ii|iii|iv)$/i;

/**
 * Collects every private string found in a document together with its replacement.
 * Collectors report what they see; the options decide what is actually kept.
 */
export class PiiDictionary {
  private readonly entries = new Map<string, PiiEntry>();
  private readonly people = new Map<string, string>();
  private readonly organizations = new Map<string, string>();
  private aliasCount = 0;

  constructor(private readonly options: ScrubOptions) {}

  private add(category: PiiCategory, original: string | undefined, replacement: string): void {
    const value = original?.trim();
    if (!value || value === replacement) return;
    const key = value.toLowerCase();
    if (!this.entries.has(key)) this.entries.set(key, { category, original: value, replacement });
  }

  person(role: PersonRole, name: NameParts): void {
    if (role === 'provider' ? !this.options.providers : !this.options.names) return;
    let given = tokens(name.given ?? []);
    let family = tokens(name.family ?? []);
    if (!given.length && !family.length) {
      const parts = tokens([name.text]).filter((t) => !TITLES.test(t));
      family = parts.slice(-1);
      given = parts.slice(0, -1);
    }
    if (!given.length && !family.length) return;
    const identity = [...given, ...family].join(' ').toLowerCase();
    let alias = this.people.get(identity);
    if (!alias) {
      alias = GREEK[this.aliasCount % GREEK.length] + (this.aliasCount >= GREEK.length ? String(Math.floor(this.aliasCount / GREEK.length) + 1) : '');
      this.aliasCount += 1;
      this.people.set(identity, alias);
    }
    const category = role === 'provider' ? 'provider' : 'name';
    family.forEach((token) => this.add(category, token, alias));
    given.forEach((token, index) => this.add(category, token, index === 0 ? ROLE_LABEL[role] : 'X'));
  }

  organization(name: string | undefined): void {
    const value = name?.trim();
    if (!this.options.providers || !value || value.length < 3) return;
    const key = value.toLowerCase();
    let alias = this.organizations.get(key);
    if (!alias) {
      alias = `Organization ${String.fromCharCode(65 + (this.organizations.size % 26))}`;
      this.organizations.set(key, alias);
    }
    this.add('provider', value, alias);
  }

  /** Registers the birth date as written plus the common ways narrative text spells it. */
  birthDate(raw: string | undefined): void {
    const iso = normalizeDate(raw);
    if (!this.options.birthDate || !raw || !iso || iso.length < 10) return;
    const [y, m, d] = iso.slice(0, 10).split('-');
    const month = MONTHS[Number(m) - 1];
    const day = String(Number(d));
    const spellings = [
      raw.trim(), `${y}-${m}-${d}`, `${y}${m}${d}`, `${m}/${d}/${y}`, `${d}/${m}/${y}`, `${d}.${m}.${y}`,
      `${day} ${month} ${y}`, `${month} ${day}, ${y}`, `${day} ${month.slice(0, 3)} ${y}`, `${month.slice(0, 3)} ${day}, ${y}`,
    ];
    for (const spelling of spellings) this.add('birthDate', spelling, y);
  }

  id(value: string | undefined, isProvider = false): void {
    if (!this.options.ids || (isProvider && !this.options.providers)) return;
    if (value && value.trim().length >= 3) this.add('id', value, syntheticId(value.trim()));
  }

  contact(value: string | undefined): void {
    if (!this.options.contacts) return;
    if (value && value.trim().length >= 3) this.add('contact', value, REDACTED);
  }

  list(): PiiEntry[] {
    return [...this.entries.values()];
  }
}
