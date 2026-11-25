import { Card, EmptyNote } from '@/components/Card';
import { byDateDesc, formatDate } from '@/domain/dates';
import { isAbnormal } from '@/domain/labs';
import type { LabItem } from '@/domain/types';
import { cx } from '@/lib/browser';
import { CodeChips } from './CodeChips';
import { FlagBadge } from './FlagBadge';
import { RangeBar } from './RangeBar';

/** Rows shown per panel before "Show all" — keeps a 10,000-result file renderable. */
const PAGE = 60;

function groupByPanel(labs: LabItem[]): Array<[string, LabItem[]]> {
  const groups = new Map<string, LabItem[]>();
  for (const lab of labs) {
    const panel = lab.panel ?? 'Other Results';
    groups.set(panel, [...(groups.get(panel) ?? []), lab]);
  }
  // Abnormal rows float to the top of their panel; panels with abnormal rows come first.
  const sorted = [...groups].map(([panel, items]): [string, LabItem[]] => [
    panel,
    items.sort((a, b) => Number(isAbnormal(b.flag)) - Number(isAbnormal(a.flag)) || byDateDesc<LabItem>((l) => l.date)(a, b)),
  ]);
  return sorted.sort(([, a], [, b]) => Number(isAbnormal(b[0].flag)) - Number(isAbnormal(a[0].flag)));
}

function LabRows({ labs }: { labs: LabItem[] }) {
  return labs.slice(0, PAGE).map((lab) => (
    <tr key={lab.id} data-testid="lab-row" className={cx('border-t border-line', isAbnormal(lab.flag) && 'bg-crit-bg/40')}>
      <td className="py-2 pr-3 pl-4">
        <div className="text-sm font-medium text-ink">{lab.name}</div>
        <CodeChips codes={lab.codes.slice(0, 1)} />
      </td>
      <td className={cx('tnum px-3 py-2 text-right text-sm font-semibold whitespace-nowrap', isAbnormal(lab.flag) ? 'text-crit-text' : 'text-ink')}>
        {lab.valueText} <span className="font-normal text-muted">{lab.unit}</span>
      </td>
      <td className="px-3 py-2">
        <FlagBadge flag={lab.flag} />
      </td>
      <td className="hidden w-44 px-3 py-2 sm:table-cell">
        <RangeBar lab={lab} />
      </td>
      <td className="tnum hidden py-2 pr-4 pl-3 text-right text-xs whitespace-nowrap text-muted md:table-cell">{formatDate(lab.date)}</td>
    </tr>
  ));
}

export function LabsTable({ id, title, labs, grouped = true }: { id: string; title: string; labs: LabItem[]; grouped?: boolean }) {
  const groups: Array<[string, LabItem[]]> = grouped ? groupByPanel(labs) : [['', [...labs].sort(byDateDesc((l) => l.date))]];
  return (
    <Card id={id} title={title} aside={labs.length} flush>
      {labs.length === 0 ? (
        <EmptyNote>Nothing recorded for this view.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="sr-only">
              <tr>
                <th>Test</th>
                <th>Result</th>
                <th>Flag</th>
                <th>Reference range</th>
                <th>Date</th>
              </tr>
            </thead>
            {groups.map(([panel, items]) => (
              <tbody key={panel}>
                {panel && (
                  <tr className="border-t border-line bg-canvas first:border-t-0">
                    <th colSpan={5} scope="colgroup" className="px-4 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                      {panel}
                    </th>
                  </tr>
                )}
                <LabRows labs={items} />
                {items.length > PAGE && (
                  <tr className="border-t border-line">
                    <td colSpan={5} className="px-4 py-2 text-xs text-muted">
                      Showing the first {PAGE} of {items.length} results. Use the Dev View to search all of them.
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </Card>
  );
}
