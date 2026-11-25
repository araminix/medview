export type Syntax = 'json' | 'xml' | 'hl7' | 'text';
export type TokenKind = 'key' | 'string' | 'number' | 'keyword' | 'tag' | 'attr' | 'punct' | 'plain';

export interface Token {
  kind: TokenKind;
  text: string;
}

const RULES: Record<Exclude<Syntax, 'text'>, Array<[TokenKind, RegExp]>> = {
  json: [
    ['key', /"(?:[^"\\]|\\.)*"(?=\s*:)/y],
    ['string', /"(?:[^"\\]|\\.)*"/y],
    ['number', /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y],
    ['keyword', /\b(?:true|false|null)\b/y],
    ['punct', /[{}[\],:]/y],
  ],
  xml: [
    ['punct', /<!--[\s\S]*?-->|<\?[\s\S]*?\?>/y],
    ['tag', /<\/?[\w:.-]+|\/?>/y],
    ['string', /"[^"]*"|'[^']*'/y],
    ['attr', /[\w:.-]+(?==)/y],
  ],
  hl7: [
    ['tag', /^[A-Z][A-Z0-9]{2}(?=\||$)/my],
    ['punct', /[|^~&]/y],
    ['number', /\b\d+(?:\.\d+)?\b/y],
  ],
};

/** A small sticky-regex tokenizer — enough colour to read raw payloads without a highlighting library. */
export function tokenize(source: string, syntax: Syntax): Token[] {
  if (syntax === 'text') return [{ kind: 'plain', text: source }];
  const rules = RULES[syntax];
  const tokens: Token[] = [];
  let plainStart = 0;
  let index = 0;
  const flushPlain = (end: number) => {
    if (end > plainStart) tokens.push({ kind: 'plain', text: source.slice(plainStart, end) });
  };
  while (index < source.length) {
    let matched = false;
    for (const [kind, pattern] of rules) {
      pattern.lastIndex = index;
      const match = pattern.exec(source);
      if (match && match[0].length > 0) {
        flushPlain(index);
        tokens.push({ kind, text: match[0] });
        index += match[0].length;
        plainStart = index;
        matched = true;
        break;
      }
    }
    if (!matched) index += 1;
  }
  flushPlain(source.length);
  return tokens;
}
