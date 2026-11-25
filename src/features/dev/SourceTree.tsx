import { useMemo } from 'react';
import type { SourceRef } from '@/domain/types';
import { cx } from '@/lib/browser';

/** Entries rendered per group; the rest are reachable through search. */
const GROUP_LIMIT = 250;

interface SourceTreeProps {
  sources: SourceRef[];
  /** When set, only these source ids are listed (keyword search hits). */
  matches?: ReadonlySet<string>;
  selected?: string;
  onSelect(id: string): void;
}

/** Collapsible list of raw units: FHIR resources by type, HL7 segments by name, C-CDA sections. */
export function SourceTree({ sources, matches, selected, onSelect }: SourceTreeProps) {
  const groups = useMemo(() => {
    const byType = new Map<string, SourceRef[]>();
    for (const source of sources) {
      if (matches && !matches.has(source.id)) continue;
      byType.set(source.type, [...(byType.get(source.type) ?? []), source]);
    }
    return [...byType];
  }, [sources, matches]);

  if (groups.length === 0) return <p className="p-4 text-sm text-muted">No matches.</p>;

  return (
    <div data-testid="source-tree">
      {groups.map(([type, items]) => (
        <details key={type} open={groups.length <= 12 || Boolean(matches)} className="border-b border-line">
          <summary className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-ink select-none hover:bg-sunken">
            <span className="min-w-0 flex-1 truncate font-mono">{type}</span>
            <span className="tnum font-normal text-muted">{items.length}</span>
          </summary>
          <ul>
            {items.slice(0, GROUP_LIMIT).map((source) => (
              <li key={source.id}>
                <button
                  type="button"
                  data-testid="source-item"
                  aria-current={selected === source.id}
                  onClick={() => onSelect(source.id)}
                  className={cx('block w-full truncate px-3 py-1 pl-6 text-left text-[13px]', selected === source.id ? 'bg-accent-tint font-medium text-accent-strong' : 'text-ink hover:bg-sunken')}
                  title={source.id}
                >
                  {source.label}
                </button>
              </li>
            ))}
            {items.length > GROUP_LIMIT && <li className="px-6 py-1 text-xs text-muted">+{(items.length - GROUP_LIMIT).toLocaleString('en-US')} more — narrow with search</li>}
          </ul>
        </details>
      ))}
    </div>
  );
}
