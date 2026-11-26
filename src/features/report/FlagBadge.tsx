import { Pill, type Tone } from '@/components/Pill';
import type { LabFlag } from '@/domain/types';
import { flagLabel } from '@/i18n/format';

const TONES: Record<LabFlag, Tone | undefined> = { high: 'crit', low: 'crit', critical: 'crit', abnormal: 'warn', normal: 'ok', unknown: undefined };

export function FlagBadge({ flag }: { flag: LabFlag }) {
  const tone = TONES[flag];
  if (!tone) return null;
  return (
    <Pill tone={tone}>
      {flagArrow(flag)} {flagLabel(flag)}
    </Pill>
  );
}

export function flagArrow(flag: LabFlag): string {
  return flag === 'high' ? '↑' : flag === 'low' ? '↓' : flag === 'critical' ? '‼' : '';
}
