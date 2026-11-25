/**
 * The only things MedView ever writes to localStorage: non-sensitive UI preferences.
 * Patient data never goes through this module.
 */
export type Theme = 'light' | 'dark';
export type WorkspaceTab = 'report' | 'map' | 'dev';

const KEYS = { theme: 'medview:theme', tab: 'medview:tab', privacyNoteSeen: 'medview:privacy-note-seen' } as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be blocked (private mode); preferences then last for the session only.
  }
}

export const preferences = {
  theme(): Theme {
    const stored = read(KEYS.theme);
    if (stored === 'light' || stored === 'dark') return stored;
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  },
  setTheme: (theme: Theme) => write(KEYS.theme, theme),
  tab(): WorkspaceTab {
    const stored = read(KEYS.tab);
    return stored === 'map' || stored === 'dev' ? stored : 'report';
  },
  setTab: (tab: WorkspaceTab) => write(KEYS.tab, tab),
  privacyNoteSeen: () => read(KEYS.privacyNoteSeen) === '1',
  markPrivacyNoteSeen: () => write(KEYS.privacyNoteSeen, '1'),
};
