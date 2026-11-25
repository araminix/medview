/** Splits HL7 v2 pipe messages into segments while honouring the delimiters declared in MSH-1/MSH-2. */

export interface Delimiters {
  field: string;
  component: string;
  repetition: string;
  escape: string;
  subcomponent: string;
}

export const DEFAULT_DELIMITERS: Delimiters = { field: '|', component: '^', repetition: '~', escape: '\\', subcomponent: '&' };

export interface Segment {
  name: string;
  /** 1-based line in the original text. */
  line: number;
  /** 1-based occurrence of this segment name in the file: OBX[3]. */
  occurrence: number;
  raw: string;
  /** fields[n] is HL7 field n (MSH is shifted so MSH-9 is fields[9]). */
  fields: string[];
  delimiters: Delimiters;
}

export function segmentId(segment: Segment): string {
  return `${segment.name}[${segment.occurrence}]`;
}

function readDelimiters(mshLine: string): Delimiters {
  const field = mshLine[3] ?? '|';
  const encoding = mshLine.slice(4).split(field)[0] ?? '';
  return {
    field,
    component: encoding[0] ?? '^',
    repetition: encoding[1] ?? '~',
    escape: encoding[2] ?? '\\',
    subcomponent: encoding[3] ?? '&',
  };
}

const SEGMENT_NAME = /^[A-Z][A-Z0-9]{2}$/;

export function tokenize(text: string): Segment[] {
  const segments: Segment[] = [];
  const counts = new Map<string, number>();
  let delimiters = DEFAULT_DELIMITERS;
  text.split(/\r\n|\r|\n/).forEach((rawLine, index) => {
    const raw = rawLine.trim();
    if (!raw) return;
    const name = raw.slice(0, 3);
    if (name === 'MSH' || name === 'FHS' || name === 'BHS') delimiters = readDelimiters(raw);
    if (!SEGMENT_NAME.test(name) || (raw.length > 3 && raw[3] !== delimiters.field)) return;
    const fields = raw.split(delimiters.field);
    // MSH-1 is the field separator itself, so every later MSH field sits one position further.
    if (name === 'MSH') fields.splice(1, 0, delimiters.field);
    const occurrence = (counts.get(name) ?? 0) + 1;
    counts.set(name, occurrence);
    segments.push({ name, line: index + 1, occurrence, raw, fields, delimiters });
  });
  return segments;
}

export function unescape(value: string, d: Delimiters): string {
  if (!value.includes(d.escape)) return value;
  const e = d.escape.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(`${e}([A-Z.][A-Za-z0-9]*)${e}`, 'g'), (whole, code: string) => {
    switch (code) {
      case 'F': return d.field;
      case 'S': return d.component;
      case 'T': return d.subcomponent;
      case 'R': return d.repetition;
      case 'E': return d.escape;
      case '.br': return '\n';
      default: return /^X[0-9A-F]+$/i.test(code) ? String.fromCharCode(parseInt(code.slice(1), 16)) : whole;
    }
  });
}

/** Raw value of field n (first repetition unless `repetition` is given). */
export function field(segment: Segment, n: number, repetition = 0): string {
  const raw = segment.fields[n] ?? '';
  if (segment.name === 'MSH' && n <= 2) return raw;
  return raw.split(segment.delimiters.repetition)[repetition] ?? '';
}

export function repetitions(segment: Segment, n: number): string[] {
  const raw = segment.fields[n] ?? '';
  return raw ? raw.split(segment.delimiters.repetition) : [];
}

/** Component c (1-based) of a field value, unescaped. */
export function component(segment: Segment, value: string, c: number): string | undefined {
  const part = value.split(segment.delimiters.component)[c - 1]?.split(segment.delimiters.subcomponent)[0];
  return part ? unescape(part, segment.delimiters).trim() || undefined : undefined;
}

/** Shorthand for component c of field n. */
export function at(segment: Segment, n: number, c = 1): string | undefined {
  return component(segment, field(segment, n), c);
}
