import type { ReactNode } from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, hint, disabled }: CheckboxProps) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-sunken has-disabled:cursor-not-allowed has-disabled:opacity-60">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-(--mv-accent-strong)"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}
