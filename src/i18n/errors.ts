import { t, type MessageKey } from '.';

type Rule = [pattern: RegExp, key: MessageKey, params?: (match: RegExpExecArray) => Record<string, string>];

/**
 * The engine reports problems in English (it runs in a worker and its messages double as
 * log text). These rules map each known message to its translation; anything unknown —
 * such as a raw XML parser detail — is shown as it is.
 */
const RULES: Rule[] = [
  [/^This JSON file is damaged or incomplete$/, 'error.jsonDamaged'],
  [/^Problem near line (\d+)\.$/, 'error.jsonNearLine', (m) => ({ line: m[1] })],
  [/^The file may have been cut off while downloading\.$/, 'error.jsonCutOff'],
  [/^This (JSON )?file is not a FHIR resource$/, 'error.jsonNotFhir'],
  [/^A FHIR file has a "resourceType"/, 'error.fhirHint'],
  [/^This XML file is (damaged or incomplete|not a C-CDA document)$/, 'error.xmlDamaged'],
  [/^Unrecognized XML document <(.*)>$/, 'error.xmlUnknown', (m) => ({ root: m[1] })],
  [/^(MedView reads FHIR XML|A C-CDA file has)/, 'error.xmlHint'],
  [/^This file format is not recognized$/, 'error.unknownFormat'],
  [/^This file is empty$/, 'error.empty'],
  [/^MedView reads FHIR \(JSON or XML\)/, 'error.supported'],
  [/^This looks like (.+), not a medical record file$/, 'error.binary', (m) => ({ kind: m[1] })],
  [/^This file is not readable text$/, 'error.notText'],
  [/^This zip archive is damaged/, 'error.zipDamaged'],
  [/^No medical record files found inside this zip archive$/, 'error.zipEmpty'],
  [/^(.+) are not supported yet$/, 'error.notYet', (m) => ({ format: m[1] })],
  [/planned for a later version\.$/, 'error.planned'],
  [/^No HL7 v2 segments found$/, 'error.noHl7'],
  [/^An HL7 v2 message starts with/, 'error.hl7Hint'],
  [/^The file engine stopped unexpectedly$/, 'error.engineStopped'],
  [/^The file may be too large for this device\.$/, 'error.engineStoppedHint'],
  [/^This file could not be (opened|read)$/, 'error.generic'],
];

export function translateError(english: string | undefined): string | undefined {
  if (!english) return undefined;
  for (const [pattern, key, params] of RULES) {
    const match = pattern.exec(english);
    if (match) return t(key, params?.(match));
  }
  return english;
}
