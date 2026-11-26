import { memo, useMemo } from 'react';
import { cx } from '@/lib/browser';
import { tokenize, type Syntax, type TokenKind } from '@/lib/highlight';

const COLORS: Record<TokenKind, string> = {
  key: 'text-accent-strong',
  string: 'text-ok-text',
  number: 'text-warn-text',
  keyword: 'text-med',
  tag: 'text-accent-strong font-semibold',
  attr: 'text-med',
  punct: 'text-muted',
  plain: '',
};

/** Beyond this size highlighting costs more than it helps; the text is shown plain. */
const HIGHLIGHT_LIMIT = 300_000;

interface CodeBlockProps {
  code: string;
  syntax: Syntax;
  className?: string;
  wrap?: boolean;
}

/** Raw payload viewer. Content is rendered as text nodes, never as HTML, and always left to right. */
export const CodeBlock = memo(function CodeBlock({ code, syntax, className, wrap = true }: CodeBlockProps) {
  const tokens = useMemo(() => tokenize(code, code.length > HIGHLIGHT_LIMIT ? 'text' : syntax), [code, syntax]);
  return (
    <pre data-testid="code-block" dir="ltr" className={cx('overflow-auto bg-sunken p-3 font-mono text-xs leading-relaxed text-ink', wrap ? 'break-all whitespace-pre-wrap' : 'whitespace-pre', className)}>
      <code>
        {tokens.map((token, index) =>
          token.kind === 'plain' ? token.text : (
            <span key={index} className={COLORS[token.kind]}>
              {token.text}
            </span>
          ),
        )}
      </code>
    </pre>
  );
});
