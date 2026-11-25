import { systemName } from '@/domain/codes';
import { normalizeDate } from '@/domain/dates';
import type { Coding } from '@/domain/types';
import { compact } from '../shared/access';
import { attr, child, elementChildren, find, textOf, type XmlElement } from '../shared/xml';

/** Resolves <originalText><reference value="#id"/></originalText> against the narrative block. */
export type TextResolver = (reference: string | undefined) => string | undefined;

/** Codings of a CD/CE element including its <translation> children. */
export function codingsOf(code: XmlElement | undefined): Coding[] {
  if (!code) return [];
  return [code, ...elementChildren(code, 'translation')].flatMap((el) => {
    const value = attr(el, 'code');
    return value ? [{ code: value, system: systemName(attr(el, 'codeSystem')) ?? attr(el, 'codeSystemName'), display: attr(el, 'displayName') }] : [];
  });
}

/** Best human label of a coded element: displayName, then originalText, then a translation, then the code. */
export function codeText(code: XmlElement | undefined, resolve: TextResolver): string | undefined {
  if (!code) return undefined;
  const original = child(code, 'originalText');
  return (
    attr(code, 'displayName') ??
    textOf(original) ??
    resolve(attr(child(original, 'reference'), 'value')) ??
    attr(child(code, 'translation'), 'displayName') ??
    attr(code, 'code')
  );
}

export function personName(name: XmlElement | undefined): string | undefined {
  if (!name) return undefined;
  const parts = compact([
    ...elementChildren(name, 'prefix').map(textOf),
    ...elementChildren(name, 'given').map(textOf),
    ...elementChildren(name, 'family').map(textOf),
    ...elementChildren(name, 'suffix').map(textOf),
  ]);
  return parts.length ? parts.join(' ') : textOf(name);
}

/** effectiveTime may be a point (@value) or an interval (<low>/<high>). */
export function timeOf(element: XmlElement | undefined, bound: 'low' | 'high' | 'point' = 'point'): string | undefined {
  if (!element) return undefined;
  if (bound === 'high') return attr(child(element, 'high'), 'value');
  return attr(element, 'value') ?? attr(child(element, 'low'), 'value') ?? (bound === 'point' ? attr(child(element, 'center'), 'value') : undefined);
}

export function dateOf(element: XmlElement | undefined, bound: 'low' | 'high' | 'point' = 'point'): string | undefined {
  return normalizeDate(timeOf(element, bound));
}

/** The clinical statement inside an <entry>, unwrapping the act → entryRelationship → observation nesting. */
export function innerObservation(entry: XmlElement): XmlElement | undefined {
  return find(entry, 'act/entryRelationship/observation') ?? child(entry, 'observation') ?? find(entry, 'act/entryRelationship/act');
}

export function hasTemplate(element: XmlElement, oid: string): boolean {
  return elementChildren(element, 'templateId').some((t) => attr(t, 'root') === oid);
}
