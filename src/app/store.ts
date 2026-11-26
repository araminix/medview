import { create } from 'zustand';
import type { BodySystem, ClinicalRecord } from '@/domain/types';
import type { LoadStage } from '@/engine/api';
import { CancelledError, engine, EngineError } from '@/engine/client';
import { directionOf, setActiveLanguage, type LanguageCode } from '@/i18n';
import { preferences, type Theme, type WorkspaceTab } from '@/lib/preferences';
import { DEFAULT_SCRUB_OPTIONS, type ScrubOptions } from '@/scrubber';

export type ModalName = 'privacy' | 'scrubber' | 'print';

interface FileInfo {
  name: string;
  size: number;
}

/** Everything tied to the open file. Lives in memory only and is dropped on Clear. */
interface Session {
  status: 'idle' | 'loading' | 'ready';
  stage?: LoadStage;
  file?: FileInfo;
  record?: ClinicalRecord;
  scrubbed: boolean;
  scrubOptions: ScrubOptions;
  error?: { message: string; hint?: string };
  bodyFilter?: BodySystem;
  /** Source selected in the Dev View or the graph drawer. */
  selectedSource?: string;
  modal?: ModalName;
}

interface AppState extends Session {
  theme: Theme;
  lang: LanguageCode;
  tab: WorkspaceTab;
  openFile(file: File): Promise<void>;
  openText(text: string, name: string): Promise<void>;
  openBytes(bytes: Uint8Array, name: string): Promise<void>;
  cancelLoad(): void;
  clearFile(): void;
  dismissError(): void;
  setTheme(theme: Theme): void;
  setLang(lang: LanguageCode): void;
  setTab(tab: WorkspaceTab): void;
  setBodyFilter(system: BodySystem | undefined): void;
  selectSource(id: string | undefined): void;
  inspectSource(id: string): void;
  openModal(modal: ModalName | undefined): void;
  applyScrub(options: ScrubOptions): Promise<void>;
  revertScrub(): Promise<void>;
}

const EMPTY_SESSION: Session = {
  status: 'idle',
  stage: undefined,
  file: undefined,
  record: undefined,
  scrubbed: false,
  scrubOptions: DEFAULT_SCRUB_OPTIONS,
  error: undefined,
  bodyFilter: undefined,
  selectedSource: undefined,
  modal: undefined,
};

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** Text direction is set on <html>, so the whole layout mirrors for right-to-left languages. */
function applyLanguage(lang: LanguageCode): void {
  setActiveLanguage(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = directionOf(lang);
}

export const useApp = create<AppState>((set, get) => {
  const load = async (name: string, size: number, read: () => Promise<Uint8Array>) => {
    set({ ...EMPTY_SESSION, status: 'loading', stage: 'reading', file: { name, size } });
    try {
      const { record, scrubbed } = await engine.load(await read(), (stage) => set({ stage }));
      // A scan opens on its pictures; any other file returns to the tab the reader last chose.
      const tab = record.imaging ? 'images' : get().tab === 'images' ? preferences.tab() : get().tab;
      set({ status: 'ready', record, scrubbed, stage: undefined, tab });
    } catch (error) {
      if (error instanceof CancelledError) return;
      const message = error instanceof EngineError ? error.message : 'This file could not be opened';
      const hint = error instanceof EngineError ? error.hint : error instanceof Error ? error.message : undefined;
      set({ ...EMPTY_SESSION, error: { message, hint } });
    }
  };

  const theme = preferences.theme();
  applyTheme(theme);
  const lang = preferences.lang();
  applyLanguage(lang);

  return {
    ...EMPTY_SESSION,
    theme,
    lang,
    tab: preferences.tab(),

    openFile: (file) => load(file.name, file.size, async () => new Uint8Array(await file.arrayBuffer())),
    openText: (text, name) => {
      const bytes = new TextEncoder().encode(text);
      return load(name, bytes.length, async () => bytes);
    },
    openBytes: (bytes, name) => load(name, bytes.length, async () => bytes),
    cancelLoad: () => {
      engine.reset();
      set(EMPTY_SESSION);
    },
    // Terminating the worker is what actually frees the raw file; resetting state drops the parsed record.
    clearFile: () => {
      engine.reset();
      set(EMPTY_SESSION);
    },
    dismissError: () => set({ error: undefined }),

    setTheme: (next) => {
      preferences.setTheme(next);
      applyTheme(next);
      set({ theme: next });
    },
    setLang: (next) => {
      preferences.setLang(next);
      applyLanguage(next);
      set({ lang: next });
    },
    setTab: (tab) => {
      if (tab !== 'images') preferences.setTab(tab);
      set({ tab });
    },
    setBodyFilter: (bodyFilter) => set({ bodyFilter }),
    selectSource: (selectedSource) => set({ selectedSource }),
    inspectSource: (id) => {
      get().setTab('dev');
      set({ selectedSource: id });
    },
    openModal: (modal) => set({ modal }),

    applyScrub: async (options) => {
      const { record, scrubbed } = await engine.call('applyScrub', options);
      set({ record, scrubbed, scrubOptions: options, selectedSource: undefined });
    },
    revertScrub: async () => {
      const { record, scrubbed } = await engine.call('revertScrub');
      set({ record, scrubbed, selectedSource: undefined });
    },
  };
});

/** The open record. Only call inside the workspace, where a record is guaranteed. */
export function useRecord(): ClinicalRecord {
  const record = useApp((state) => state.record);
  if (!record) throw new Error('No record is open');
  return record;
}
