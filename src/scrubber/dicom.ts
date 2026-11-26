import { DicomValues, readDicom } from '@/parsers/dicom/reader';
import { UnreadableFileError } from '@/parsers/types';
import { syntheticId } from './dictionary';
import { REDACTED, type PiiCategory, type ScrubChange, type ScrubOptions } from './types';

type Rule = [category: PiiCategory, replace: (value: string) => string];

const fixed = (text: string) => () => text;
const NAME: Rule = ['name', fixed('ANONYMOUS')];
const ID: Rule = ['id', syntheticId];
const CONTACT: Rule = ['contact', fixed(REDACTED)];
const DOCTOR: Rule = ['provider', fixed('DOCTOR')];
const PLACE: Rule = ['provider', fixed('ORGANIZATION')];

/** The attributes that identify a person or a place, wherever in the file they appear. */
const RULES: Record<string, Rule> = {
  '0010,0010': NAME, '0010,1001': NAME, '0010,1005': NAME, '0010,1060': NAME,
  // The year is kept so the age stays right; a time of birth is zeroed.
  '0010,0030': ['birthDate', (value) => `${value.slice(0, 4)}0101`], '0010,0032': ['birthDate', fixed('000000')],
  '0010,0020': ID, '0010,1000': ID, '0008,0050': ID, '0020,0010': ID,
  '0010,1040': CONTACT, '0010,2154': CONTACT, '0010,4000': CONTACT,
  '0008,0090': DOCTOR, '0008,1048': DOCTOR, '0008,1050': DOCTOR, '0008,1070': DOCTOR, '0032,1032': DOCTOR,
  '0008,0080': PLACE, '0008,0081': PLACE, '0008,1010': PLACE, '0008,1040': PLACE,
};

const ENABLED: Record<PiiCategory, keyof ScrubOptions> = { name: 'names', birthDate: 'birthDate', id: 'ids', contact: 'contacts', provider: 'providers' };

/**
 * Anonymizes a DICOM file in place: each private value is overwritten by a stand-in of the same
 * length, so every offset and length in the file stays true and the picture is untouched.
 * Text burned into the picture itself, private vendor attributes and unique identifiers are not changed.
 */
export function scrubDicom(bytes: Uint8Array, options: ScrubOptions, changes: Map<string, ScrubChange> = new Map()): Uint8Array {
  const file = readDicom(bytes);
  if (!file.editable) throw new UnreadableFileError('This DICOM file cannot be anonymized', 'Its data is stored compressed (deflated). The picture and its details can still be viewed.');
  const values = new DicomValues(file);
  const output = bytes.slice();
  for (const element of file.elements) {
    const rule = RULES[element.tag];
    if (!rule || element.length === 0 || !options[ENABLED[rule[0]]]) continue;
    const original = values.decode(element);
    if (!original) continue;
    const replacement = rule[1](original).slice(0, element.length);
    if (replacement === original) continue;
    for (let i = 0; i < element.length; i += 1) output[element.offset + i] = i < replacement.length ? replacement.charCodeAt(i) : 0x20;
    const key = `${rule[0]}:${original}`;
    const change = changes.get(key);
    if (change) change.count += 1;
    else changes.set(key, { category: rule[0], original, replacement, count: 1 });
  }
  return output;
}
