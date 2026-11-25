import { systemName } from '@/domain/codes';
import type { ClinicalStatus, Coding } from '@/domain/types';
import { arr, compact, isObj, objs, pickStr, str, type Obj } from '../shared/access';

/** Codings of a CodeableConcept (or of a bare Coding). */
export function codingsOf(concept: unknown): Coding[] {
  if (!isObj(concept)) return [];
  const raw = concept.coding ? objs(concept.coding) : concept.code ? [concept] : [];
  return raw.flatMap((c) => {
    const code = str(c.code);
    return code ? [{ code, system: systemName(str(c.system)), display: str(c.display) }] : [];
  });
}

/** Best human text of a CodeableConcept: text, then a coding display, then a code. */
export function conceptText(concept: unknown): string | undefined {
  if (typeof concept === 'string') return str(concept);
  if (!isObj(concept)) return undefined;
  const codings = objs(concept.coding);
  return (
    str(concept.text) ??
    str(codings.find((c) => str(c.display))?.display) ??
    str(concept.display) ??
    str(codings[0]?.code)
  );
}

export function firstCode(concept: unknown): string | undefined {
  return pickStr(concept, 'coding.code');
}

export function humanName(names: unknown): string | undefined {
  const list = objs(names);
  const name = list.find((n) => n.use === 'official') ?? list.find((n) => n.use !== 'old') ?? list[0];
  if (!name) return typeof names === 'string' ? str(names) : undefined;
  const text = str(name.text);
  if (text) return text;
  const parts = compact([...arr(name.prefix).map(str), ...arr(name.given).map(str), str(name.family), ...arr(name.suffix).map(str)]);
  return parts.length ? parts.join(' ') : undefined;
}

/** The literal reference string of a Reference (or R5 CodeableReference). */
export function referenceOf(value: unknown): string | undefined {
  if (!isObj(value)) return undefined;
  return str(value.reference) ?? (isObj(value.reference) ? str(value.reference.reference) : undefined);
}

export function referenceDisplay(value: unknown): string | undefined {
  if (!isObj(value)) return undefined;
  return str(value.display) ?? (isObj(value.reference) ? str(value.reference.display) : undefined);
}

export function clinicalStatus(resource: Obj, activeCodes: string[], inactiveCodes: string[]): ClinicalStatus {
  const code = (firstCode(resource.clinicalStatus) ?? str(resource.clinicalStatus) ?? str(resource.status) ?? '').toLowerCase();
  if (activeCodes.includes(code)) return 'active';
  if (inactiveCodes.includes(code)) return 'inactive';
  return 'unknown';
}
