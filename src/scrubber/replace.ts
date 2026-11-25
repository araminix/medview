import { REDACTED, type PiiEntry, type ScrubChange, type ScrubOptions } from './types';

const CHUNK = 400;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** The spellings of a value as it may appear inside raw JSON or XML text. */
function rawSpellings(value: string): string[] {
  return [...new Set([value, JSON.stringify(value).slice(1, -1), escapeXml(value)])];
}

/** Patterns for contact details that hide in free text (notes, narrative) rather than coded fields. */
const FREE_TEXT_PATTERNS: Array<[label: string, pattern: RegExp]> = [
  ['E-mail address in free text', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
  ['Phone number in free text', /(?<![\w.])(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w])/g],
  ['SSN-like number in free text', /(?<![\w-])\d{3}-\d{2}-\d{4}(?![\w-])/g],
];

/**
 * Replaces every dictionary entry in the raw text. Working on the raw text keeps the
 * original syntax (JSON, XML, HL7 pipes) intact, and catches values repeated in
 * narrative HTML or comment segments that a structural pass would miss.
 */
export function replaceAll(text: string, entries: PiiEntry[], options: ScrubOptions): { text: string; changes: ScrubChange[] } {
  const bySpelling = new Map<string, ScrubChange>();
  const changes: ScrubChange[] = [];
  for (const entry of entries) {
    const change: ScrubChange = { ...entry, count: 0 };
    changes.push(change);
    for (const spelling of rawSpellings(entry.original)) {
      const key = spelling.toLowerCase();
      if (!bySpelling.has(key)) bySpelling.set(key, change);
    }
  }

  // Longest first so "Riverside Community Hospital" wins over a shorter overlapping entry.
  const spellings = [...bySpelling.keys()].sort((a, b) => b.length - a.length);
  let output = text;
  for (let start = 0; start < spellings.length; start += CHUNK) {
    const alternatives = spellings.slice(start, start + CHUNK).map(escapeRegExp).join('|');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'giu');
    output = output.replace(pattern, (match) => {
      const change = bySpelling.get(match.toLowerCase());
      if (!change) return match;
      change.count += 1;
      return change.replacement;
    });
  }

  if (options.contacts) {
    for (const [label, pattern] of FREE_TEXT_PATTERNS) {
      let count = 0;
      let example = '';
      output = output.replace(pattern, (match) => {
        count += 1;
        example ||= match;
        return REDACTED;
      });
      if (count) changes.push({ category: 'contact', original: count > 1 ? `${example} (+${count - 1} more) — ${label}` : example, replacement: REDACTED, count });
    }
  }
  return { text: output, changes: changes.filter((change) => change.count > 0) };
}
