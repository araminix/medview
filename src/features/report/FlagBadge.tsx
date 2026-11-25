import { Pill, type Tone } from '@/components/Pill';
import type { LabFlag } from '@/domain/types';

const FLAGS: Record<LabFlag, { label: string; tone: Tone } | undefined> = {
  high: { label: '↑ High', tone: 'crit' },
  low: { label: '↓ Low', tone: 'crit' },
  critical: { label: '‼ Critical', tone: 'crit' },
  abnormal: { label: 'Abnormal', tone: 'warn' },
  normal: { label: 'Normal', tone: 'ok' },
  unknown: undefined,
};

export function FlagBadge({ flag }: { flag: LabFlag }) {
  const info = FLAGS[flag];
  return info ? <Pill tone={info.tone}>{info.label}</Pill> : null;
}

export function flagArrow(flag: LabFlag): string {
  return flag === 'high' ? '↑' : flag === 'low' ? '↓' : flag === 'critical' ? '‼' : '';
}
