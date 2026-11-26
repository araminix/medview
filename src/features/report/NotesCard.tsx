import { useMemo } from 'react';
import { Card } from '@/components/Card';
import { t } from '@/i18n';
import { formatDate } from '@/i18n/format';
import type { ClinicalNoteItem, ParseWarning } from '@/domain/types';
import { sanitizeNarrative } from '@/lib/sanitize';

function Narrative({ note }: { note: ClinicalNoteItem }) {
  const html = useMemo(() => (note.html ? sanitizeNarrative(note.html) : undefined), [note.html]);
  if (html) return <div className="narrative text-sm text-ink" dir="auto" dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <p className="text-sm whitespace-pre-line text-ink" dir="auto">
      {note.text}
    </p>
  );
}

export function NotesCard({ notes }: { notes: ClinicalNoteItem[] }) {
  if (notes.length === 0) return null;
  return (
    <Card id="notes" title={t('section.notes')} aside={notes.length} flush>
      <ul className="divide-y divide-line">
        {notes.slice(0, 50).map((note) => (
          <li key={note.id} className="px-4 py-3">
            <p className="mb-1 flex items-baseline gap-2">
              <span className="text-sm font-semibold text-ink" dir="auto">
                {note.title}
              </span>
              <span className="tnum text-xs text-muted">{note.date ? formatDate(note.date) : ''}</span>
            </p>
            <Narrative note={note} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function WarningsCard({ warnings }: { warnings: ParseWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <Card id="warnings" title={t('warn.title')} aside={warnings.length} flush>
      <p className="border-b border-line bg-warn-bg px-4 py-2 text-xs text-warn-text">
        {t('warn.intro')}
      </p>
      <ul className="divide-y divide-line">
        {warnings.slice(0, 200).map((warning, index) => (
          <li key={index} data-testid="warning" className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-sm">
            {/* Diagnostics quote the file and its syntax, so they stay in English, left to right. */}
            <span className="text-ink" dir="ltr">
              {warning.line ? `Line ${warning.line}: ` : ''}
              {warning.message}
            </span>
            {warning.path && <code className="font-mono text-xs text-muted">{warning.path}</code>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
