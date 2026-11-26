import type { Coding } from '@/domain/types';
import { isObj, num, objs, pick, str, type Obj } from '../shared/access';

/** The reference-model class of a node. Canonical JSON names it in `_type`; older exports leave it to the shape. */
export function typeOf(node: Obj): string {
  const declared = str(node._type)?.toUpperCase();
  if (declared) return declared;
  if ('items' in node) return 'CLUSTER';
  return isObj(node.value) ? 'ELEMENT' : '';
}

export function nameOf(node: unknown): string | undefined {
  return str(pick(node, 'name.value'));
}

/** "openEHR-EHR-OBSERVATION.blood_pressure.v2" → "blood_pressure". */
export function conceptOf(node: Obj): string {
  return /^openEHR-EHR-[A-Z_]+\.([\w-]+)\.v\d+/i.exec(str(node.archetype_node_id) ?? '')?.[1]?.toLowerCase() ?? '';
}

export interface Leaf {
  name: string;
  value: Obj;
  /** The CLUSTER the element sits in, when it sits in one. */
  cluster?: Obj;
}

/** Every ELEMENT under an item structure, depth first. */
export function leaves(root: unknown, cluster?: Obj): Leaf[] {
  return objs(pick(root, 'items') ?? (isObj(root) ? root.item : undefined)).flatMap((item): Leaf[] => {
    if (typeOf(item) === 'CLUSTER' || 'items' in item) return leaves(item, item);
    return isObj(item.value) ? [{ name: nameOf(item) ?? 'Value', value: item.value, cluster }] : [];
  });
}

const QUANTITATIVE = new Set(['DV_QUANTITY', 'DV_COUNT', 'DV_PROPORTION']);

export function isQuantity(value: Obj): boolean {
  return QUANTITATIVE.has(typeOf(value)) || (num(value.magnitude) !== undefined && !typeOf(value));
}

export interface Measured {
  value?: number;
  text: string;
  unit?: string;
}

const PERCENT = 2;

export function measure(value: Obj): Measured | undefined {
  if (typeOf(value) === 'DV_PROPORTION') {
    const numerator = num(value.numerator);
    if (numerator === undefined) return undefined;
    if (num(value.type) === PERCENT) return { value: numerator, text: String(numerator), unit: '%' };
    return { text: `${numerator}/${num(value.denominator) ?? 1}` };
  }
  const magnitude = num(value.magnitude);
  if (magnitude === undefined) return undefined;
  return { value: magnitude, text: String(magnitude), unit: str(value.units) };
}

/** A data value as a person would read it. */
export function dvText(value: Obj): string | undefined {
  switch (typeOf(value)) {
    case 'DV_QUANTITY':
    case 'DV_COUNT':
    case 'DV_PROPORTION': {
      const measured = measure(value);
      return measured ? [measured.text, measured.unit].filter(Boolean).join(' ') : undefined;
    }
    case 'DV_ORDINAL':
    case 'DV_SCALE':
      return str(pick(value, 'symbol.value')) ?? str(value.value);
    case 'DV_BOOLEAN':
      return value.value === true || value.value === 'true' ? 'Yes' : 'No';
    case 'DV_IDENTIFIER':
      return str(value.id);
    case 'DV_INTERVAL': {
      const ends = [value.lower, value.upper].filter(isObj).map(dvText).filter(Boolean);
      return ends.length ? ends.join(' – ') : undefined;
    }
    default:
      return str(value.value);
  }
}

/** The external code of a coded text. Codes local to the archetype ("at0005") say nothing outside it. */
export function codesOf(value: Obj): Coding[] {
  const code = str(pick(value, 'defining_code.code_string'));
  const system = str(pick(value, 'defining_code.terminology_id.value'));
  if (!code || !system || /^(local|openehr)$/i.test(system)) return [];
  return [{ code, system: system.replace(/\(.*\)$/, ''), display: str(value.value) }];
}

export function find(list: Leaf[], pattern: RegExp): Leaf | undefined {
  return list.find((leaf) => pattern.test(leaf.name));
}
