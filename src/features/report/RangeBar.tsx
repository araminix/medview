import type { LabItem } from '@/domain/types';
import { isAbnormal } from '@/domain/labs';
import { cx } from '@/lib/browser';

/** Where the normal band sits inside the bar, in percent. */
const BAND = { start: 25, end: 75 };

/** Maps a value onto the bar so the reference range always fills the middle band. */
function position(value: number, low: number | undefined, high: number | undefined): number {
  let from = low;
  let to = high;
  // One-sided ranges ("<200", ">60") get a synthetic opposite bound so the bar keeps its shape.
  if (from === undefined && to !== undefined) from = to > 0 ? 0 : to * 2;
  if (to === undefined && from !== undefined) to = from > 0 ? from * 2 : 1;
  if (from === undefined || to === undefined || to === from) return 50;
  const percent = BAND.start + ((value - from) / (to - from)) * (BAND.end - BAND.start);
  return Math.min(97, Math.max(3, percent));
}

/** Low | Normal | High strip with a marker at the patient's value. */
export function RangeBar({ lab }: { lab: LabItem }) {
  if (lab.value === undefined || (lab.refLow === undefined && lab.refHigh === undefined)) {
    return <span className="text-xs text-muted">{lab.refText ?? '—'}</span>;
  }
  const left = position(lab.value, lab.refLow, lab.refHigh);
  const abnormal = isAbnormal(lab.flag);
  const hasLow = lab.refLow !== undefined;
  const hasHigh = lab.refHigh !== undefined;
  return (
    <div className="w-full min-w-28" title={`Reference: ${lab.refText ?? ''}`}>
      <div className="relative h-2 rounded-full bg-sunken">
        <div
          className="absolute inset-y-0 bg-ok/30"
          style={{ left: hasLow ? `${BAND.start}%` : 0, right: hasHigh ? `${100 - BAND.end}%` : 0, borderRadius: 9999 }}
        />
        <div
          className={cx('absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface', abnormal ? 'bg-crit' : 'bg-ok')}
          style={{ left: `${left}%` }}
        />
      </div>
      <div className="tnum mt-1 flex justify-between text-[11px] text-muted">
        <span style={{ marginLeft: `${BAND.start - 6}%` }}>{hasLow ? lab.refLow : ''}</span>
        <span style={{ marginRight: `${100 - BAND.end - 6}%` }}>{hasHigh ? lab.refHigh : ''}</span>
      </div>
    </div>
  );
}
