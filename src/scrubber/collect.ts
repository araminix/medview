import { arr, isObj, objs, str, type Obj } from '@/parsers/shared/access';
import { component, field, repetitions, tokenize, type Segment } from '@/parsers/hl7v2/tokenizer';
import { attr, descendants, elementChildren, textOf, type XmlElement } from '@/parsers/shared/xml';
import type { PersonRole, PiiDictionary } from './dictionary';

const PROVIDER_RESOURCES = new Set(['Practitioner', 'PractitionerRole', 'Organization', 'Location', 'HealthcareService', 'CareTeam']);
const ORGANIZATION_RESOURCES = new Set(['Organization', 'Location', 'HealthcareService']);

/** Walks FHIR JSON. The enclosing resource decides whether a name belongs to the patient, a relative or a provider. */
export function collectFhir(root: unknown, pii: PiiDictionary): void {
  const organizationRefs = new Set<string>();

  const visitResource = (resource: Obj): void => {
    const type = str(resource.resourceType) ?? '';
    const isProvider = PROVIDER_RESOURCES.has(type);
    const role: PersonRole = type === 'Patient' ? 'patient' : isProvider ? 'provider' : 'relative';
    if (type === 'Patient') pii.birthDate(str(resource.birthDate));
    if (ORGANIZATION_RESOURCES.has(type)) {
      pii.organization(str(resource.name));
      arr(resource.alias).forEach((alias) => pii.organization(str(alias)));
      if (resource.id) organizationRefs.add(`${type}/${str(resource.id)}`);
    }
    walk(resource, role, isProvider, type);
  };

  const walk = (value: unknown, role: PersonRole, isProvider: boolean, type: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, role, isProvider, type));
      return;
    }
    if (!isObj(value)) return;
    for (const [key, node] of Object.entries(value)) {
      if ((key === 'resource' || key === 'contained') && typeof node === 'object') {
        arr(node).filter(isObj).forEach(visitResource);
      } else if (key === 'name' && !ORGANIZATION_RESOURCES.has(type)) {
        // Patient.contact[].name is a relative even though it sits inside the Patient resource.
        const nameRole = role === 'patient' && 'relationship' in value ? 'relative' : role;
        for (const name of objs(node)) pii.person(nameRole, { given: arr(name.given).map(str), family: [str(name.family)], text: str(name.text) });
        if (typeof node === 'string') pii.person(nameRole, { text: node });
      } else if (key === 'identifier') {
        objs(node).forEach((id) => pii.id(str(id.value), isProvider));
      } else if (key === 'telecom') {
        objs(node).forEach((t) => pii.contact(str(t.value)));
      } else if (key === 'address' && type !== 'Location') {
        for (const address of objs(node)) {
          [...arr(address.line), address.city, address.district, address.postalCode, address.text].forEach((part) => pii.contact(str(part)));
        }
      } else if (typeof node === 'object') {
        walk(node, role, isProvider, type);
      }
    }
  };

  // Reference displays repeat provider names outside the provider resources themselves.
  const collectDisplays = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(collectDisplays);
    else if (isObj(value)) {
      const reference = str(value.reference);
      const display = str(value.display);
      if (reference && display) {
        if (/^(Organization|Location)\//.test(reference) || organizationRefs.has(reference)) pii.organization(display);
        else if (/^(Practitioner|PractitionerRole)\//.test(reference)) pii.person('provider', { text: display });
        else if (/^RelatedPerson\//.test(reference)) pii.person('relative', { text: display });
        else if (/^Patient\//.test(reference)) pii.person('patient', { text: display });
      }
      Object.values(value).forEach(collectDisplays);
    }
  };

  if (isObj(root)) visitResource(root);
  collectDisplays(root);
}

/** XPN (family^given^middle) starts at component 1; XCN carries an id first. */
function hl7Person(pii: PiiDictionary, segment: Segment, value: string, role: PersonRole, hasId = false): void {
  if (!value) return;
  const offset = hasId ? 1 : 0;
  if (hasId) pii.id(component(segment, value, 1), true);
  pii.person(role, { family: [component(segment, value, 1 + offset)], given: [component(segment, value, 2 + offset), component(segment, value, 3 + offset)] });
}

function hl7Address(pii: PiiDictionary, segment: Segment, n: number): void {
  for (const rep of repetitions(segment, n)) [1, 2, 3, 5].forEach((c) => pii.contact(component(segment, rep, c)));
}

function hl7Phones(pii: PiiDictionary, segment: Segment, n: number): void {
  for (const rep of repetitions(segment, n)) [1, 4].forEach((c) => pii.contact(component(segment, rep, c)));
}

const HL7_COLLECTORS: Record<string, (segment: Segment, pii: PiiDictionary) => void> = {
  MSH(segment, pii) {
    [3, 4, 5, 6].forEach((n) => pii.organization(component(segment, field(segment, n), 1)));
  },
  PID(segment, pii) {
    [2, 3, 4].forEach((n) =>
      repetitions(segment, n).forEach((rep) => {
        pii.id(component(segment, rep, 1));
        pii.organization(component(segment, rep, 4));
      }),
    );
    repetitions(segment, 5).forEach((rep) => hl7Person(pii, segment, rep, 'patient'));
    repetitions(segment, 6).forEach((rep) => hl7Person(pii, segment, rep, 'relative'));
    repetitions(segment, 9).forEach((rep) => hl7Person(pii, segment, rep, 'patient'));
    pii.birthDate(component(segment, field(segment, 7), 1));
    hl7Address(pii, segment, 11);
    hl7Phones(pii, segment, 13);
    hl7Phones(pii, segment, 14);
    [18, 19, 20].forEach((n) => pii.id(component(segment, field(segment, n), 1)));
  },
  NK1(segment, pii) {
    repetitions(segment, 2).forEach((rep) => hl7Person(pii, segment, rep, 'relative'));
    hl7Address(pii, segment, 4);
    hl7Phones(pii, segment, 5);
    hl7Phones(pii, segment, 6);
  },
  GT1(segment, pii) {
    repetitions(segment, 3).forEach((rep) => hl7Person(pii, segment, rep, 'relative'));
    hl7Address(pii, segment, 5);
    hl7Phones(pii, segment, 6);
    pii.id(component(segment, field(segment, 12), 1));
  },
  IN1(segment, pii) {
    pii.organization(component(segment, field(segment, 4), 1));
    repetitions(segment, 16).forEach((rep) => hl7Person(pii, segment, rep, 'relative'));
    [2, 8, 36, 49].forEach((n) => pii.id(component(segment, field(segment, n), 1)));
  },
  PV1(segment, pii) {
    [7, 8, 9, 17].forEach((n) => repetitions(segment, n).forEach((rep) => hl7Person(pii, segment, rep, 'provider', true)));
    pii.organization(component(segment, field(segment, 3), 4));
    pii.id(component(segment, field(segment, 19), 1));
  },
  ORC(segment, pii) {
    repetitions(segment, 12).forEach((rep) => hl7Person(pii, segment, rep, 'provider', true));
  },
  OBR(segment, pii) {
    repetitions(segment, 16).forEach((rep) => hl7Person(pii, segment, rep, 'provider', true));
  },
  OBX(segment, pii) {
    repetitions(segment, 16).forEach((rep) => hl7Person(pii, segment, rep, 'provider', true));
  },
};

export function collectHl7(text: string, pii: PiiDictionary): void {
  for (const segment of tokenize(text)) HL7_COLLECTORS[segment.name]?.(segment, pii);
}

const ORGANIZATION_ELEMENT = /organization$/i;
const SSN_ROOT = '2.16.840.1.113883.4.1';
const NPI_ROOT = '2.16.840.1.113883.4.6';

/** Role of a CDA <name>, decided by the nearest ancestor that gives it meaning. */
function ccdaRole(element: XmlElement): PersonRole | 'organization' | 'place' | undefined {
  for (let node = element.parentNode as XmlElement | null; node; node = node.parentNode as XmlElement | null) {
    const name = node.localName ?? '';
    if (ORGANIZATION_ELEMENT.test(name)) return 'organization';
    if (name === 'playingEntity') return attr(node, 'classCode') === 'PLC' ? 'place' : undefined;
    if (name === 'guardian' || name === 'relatedEntity' || name === 'relatedSubject') return 'relative';
    if (name === 'patient') return 'patient';
    if (name === 'assignedPerson' || name === 'informationRecipient' || name === 'associatedPerson') return 'provider';
  }
  return undefined;
}

export function collectCcda(root: XmlElement, pii: PiiDictionary): void {
  descendants(root, (element) => {
    switch (element.localName) {
      case 'name': {
        const role = ccdaRole(element);
        if (role === 'organization' || role === 'place') pii.organization(textOf(element));
        else if (role) pii.person(role, { given: elementChildren(element, 'given').map(textOf), family: elementChildren(element, 'family').map(textOf), text: textOf(element) });
        break;
      }
      case 'birthTime':
        if (element.parentNode && (element.parentNode as XmlElement).localName === 'patient') pii.birthDate(attr(element, 'value'));
        break;
      case 'telecom':
        pii.contact(attr(element, 'value')?.replace(/^(tel|mailto|fax):/i, ''));
        break;
      case 'addr':
        ['streetAddressLine', 'city', 'postalCode', 'county'].forEach((part) => elementChildren(element, part).forEach((el) => pii.contact(textOf(el))));
        break;
      case 'id': {
        const parent = (element.parentNode as XmlElement | null)?.localName;
        const idRoot = attr(element, 'root');
        const isPatient = parent === 'patientRole' || idRoot === SSN_ROOT;
        const isProvider = idRoot === NPI_ROOT || parent === 'assignedAuthor' || parent === 'assignedEntity';
        if (isPatient || isProvider || parent === 'ClinicalDocument') pii.id(attr(element, 'extension'), isProvider && !isPatient);
        break;
      }
      default:
    }
  });
}

/** Keys of an openEHR composition whose "name" is a person or an organization (PARTY_IDENTIFIED). */
const OPENEHR_PEOPLE = new Set(['composer', 'performer', 'provider', 'committer', 'subject']);
const OPENEHR_ORGANIZATIONS = new Set(['health_care_facility']);

/**
 * Walks a canonical openEHR composition. It holds no patient demographics by design, so what there is
 * to hide are the clinicians, the facility, their identifiers and any identifier values recorded.
 */
export function collectOpenEhr(root: unknown, pii: PiiDictionary): void {
  const walk = (value: unknown, key: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, key));
      return;
    }
    if (!isObj(value)) return;
    const name = str(value.name);
    if (name && OPENEHR_ORGANIZATIONS.has(key)) pii.organization(name);
    else if (name && OPENEHR_PEOPLE.has(key)) pii.person(key === 'subject' ? 'patient' : 'provider', { text: name });
    if (key === 'identifiers') pii.id(str(value.id), true);
    if (str(value._type)?.toUpperCase() === 'DV_IDENTIFIER') pii.id(str(value.id));
    for (const [childKey, child] of Object.entries(value)) if (typeof child === 'object') walk(child, childKey);
  };
  walk(root, '');
}
