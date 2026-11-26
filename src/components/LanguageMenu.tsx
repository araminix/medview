import { Languages } from 'lucide-react';
import { useApp } from '@/app/store';
import { isLanguage, LANGUAGES, t } from '@/i18n';

/** The interface language, each one named in itself. */
export function LanguageMenu() {
  const lang = useApp((state) => state.lang);
  const setLang = useApp((state) => state.setLang);
  return (
    <label className="relative inline-flex h-8 shrink-0 items-center rounded-md text-muted hover:bg-sunken hover:text-ink">
      <span className="sr-only">{t('lang.label')}</span>
      <Languages size={16} className="pointer-events-none absolute start-2" aria-hidden="true" />
      <select
        value={lang}
        data-testid="language-menu"
        onChange={(event) => isLanguage(event.target.value) && setLang(event.target.value)}
        className="h-8 cursor-pointer appearance-none rounded-md bg-transparent ps-8 pe-2 text-sm font-medium text-inherit"
      >
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code} lang={language.code} className="bg-surface text-ink">
            {language.name}
          </option>
        ))}
      </select>
    </label>
  );
}
