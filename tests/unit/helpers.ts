import { readFileSync } from 'node:fs';
import { parseText } from '@/parsers';

export function sample(name: string): string {
  return readFileSync(new URL(`../../src/samples/${name}`, import.meta.url), 'utf8');
}

export function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

export function recordOf(text: string) {
  return parseText(text).record;
}

export function warningsOf(text: string): string[] {
  return recordOf(text).meta.warnings.map((w) => w.message);
}
