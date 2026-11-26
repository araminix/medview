import { detectSyntax } from '@/parsers/detect';
import { fhirXmlToJson } from '@/parsers/fhir/xmlToJson';
import { findComposition } from '@/parsers/openehr/parseOpenEhr';
import { openEhrXmlToJson } from '@/parsers/openehr/xmlToJson';
import { parseXml } from '@/parsers/shared/xml';
import { collectCcda, collectFhir, collectHl7, collectOpenEhr } from './collect';
import { PiiDictionary } from './dictionary';
import { replaceAll } from './replace';
import type { ScrubOptions, ScrubResult } from './types';

export * from './types';

/**
 * Anonymizes a raw medical file while keeping its syntax, codes and clinical values intact.
 * `fhirRoot` lets the caller reuse an already-parsed FHIR JSON document.
 */
export function scrubText(text: string, options: ScrubOptions, fhirRoot?: unknown): ScrubResult {
  const pii = new PiiDictionary(options);
  switch (detectSyntax(text)) {
    case 'json': {
      const root: unknown = fhirRoot ?? JSON.parse(text);
      if (findComposition(root)) collectOpenEhr(root, pii);
      else collectFhir(root, pii);
      break;
    }
    case 'xml': {
      const root = parseXml(text).documentElement!;
      if (root.localName === 'ClinicalDocument') collectCcda(root, pii);
      else if (root.localName === 'composition') collectOpenEhr(openEhrXmlToJson(root, new WeakMap()), pii);
      else collectFhir(fhirXmlToJson(root, new WeakMap()), pii);
      break;
    }
    case 'hl7':
      collectHl7(text, pii);
      break;
    default:
  }
  return replaceAll(text, pii.list(), options);
}
