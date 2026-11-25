import { formatCoding } from '@/domain/codes';
import type { Coding } from '@/domain/types';

/** Standard codes (ICD-10, SNOMED, RxNorm, LOINC) as quiet monospace chips with the full name on hover. */
export function CodeChips({ codes }: { codes: Coding[] }) {
  if (codes.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {codes.slice(0, 2).map((code) => (
        <abbr key={`${code.system}-${code.code}`} title={formatCoding(code)} className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-muted no-underline">
          {code.system ? `${code.system} ` : ''}
          {code.code}
        </abbr>
      ))}
    </span>
  );
}
