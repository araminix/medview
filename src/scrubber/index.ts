import { detectSyntax } from '@/parsers/detect';
import { fhirXmlToJson } from '@/parsers/fhir/xmlToJson';
import { parseXml } from '@/parsers/shared/xml';
import { collectCcda, collectFhir, collectHl7 } from './collect';
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
    case 'json':
      collectFhir(fhirRoot ?? JSON.parse(text), pii);
      break;
    case 'xml': {
      const root = parseXml(text).documentElement!;
      if (root.localName === 'ClinicalDocument') collectCcda(root, pii);
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
