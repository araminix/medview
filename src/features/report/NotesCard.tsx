import { useMemo } from 'react';
import { Card } from '@/components/Card';
import { formatDate } from '@/domain/dates';
import type { ClinicalNoteItem, ParseWarning } from '@/domain/types';
import { sanitizeNarrative } from '@/lib/sanitize';

function Narrative({ note }: { note: ClinicalNoteItem }) {
  const html = useMemo(() => (note.html ? sanitizeNarrative(note.html) : undefined), [note.html]);
  if (html) return <div className="narrative text-sm text-ink" dangerouslySetInnerHTML={{ __html: html }} />;
  return <p className="text-sm whitespace-pre-line text-ink">{note.text}</p>;
}

export function NotesCard({ notes }: { notes: ClinicalNoteItem[] }) {
  if (notes.length === 0) return null;
  return (
    <Card id="notes" title="Notes & Documents" aside={notes.length} flush>
      <ul className="divide-y divide-line">
        {notes.slice(0, 50).map((note) => (
          <li key={note.id} className="px-4 py-3">
            <p className="mb-1 flex items-baseline gap-2">
              <span className="text-sm font-semibold text-ink">{note.title}</span>
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
    <Card id="warnings" title="Parse warnings" aside={warnings.length} flush>
      <p className="border-b border-line bg-warn-bg px-4 py-2 text-xs text-warn-text">
        The file had problems in these places. Everything that could be read is shown above.
      </p>
      <ul className="divide-y divide-line">
        {warnings.slice(0, 200).map((warning, index) => (
          <li key={index} data-testid="warning" className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-sm">
            <span className="text-ink">
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
