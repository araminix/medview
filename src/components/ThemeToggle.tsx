import { Moon, Sun } from 'lucide-react';
import { useApp } from '@/app/store';
import { t } from '@/i18n';

export function ThemeToggle() {
  const theme = useApp((state) => state.theme);
  const setTheme = useApp((state) => state.setTheme);
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = t(next === 'dark' ? 'theme.toDark' : 'theme.toLight');
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
