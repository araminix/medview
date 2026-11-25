/** Defensive accessors for untrusted, loosely-shaped parsed documents. */

export type Obj = Record<string, unknown>;

export function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Treats a missing value as [], and a single value as a one-element list. */
export function arr(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function objs(value: unknown): Obj[] {
  return arr(value).filter(isObj);
}

export function str(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

export function num(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/** Walks a dotted path; whenever it meets an array it continues with the first element. */
export function pick(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const key of path.split('.')) {
    if (Array.isArray(current)) current = current[0];
    if (!isObj(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function pickStr(root: unknown, path: string): string | undefined {
  const value = pick(root, path);
  return str(Array.isArray(value) ? value[0] : value);
}

/** First defined result of the given paths. */
export function firstStr(root: unknown, ...paths: string[]): string | undefined {
  for (const path of paths) {
    const value = pickStr(root, path);
    if (value) return value;
  }
  return undefined;
}

export function compact<T>(values: Array<T | undefined | null | false | ''>): T[] {
  return values.filter(Boolean) as T[];
}
