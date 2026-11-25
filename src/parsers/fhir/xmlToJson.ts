import { type Obj } from '../shared/access';
import { attr, elementChildren, serializeXml, type XmlElement } from '../shared/xml';

/** Elements that are lists in FHIR JSON even when the XML holds a single one. */
const ARRAY_KEYS = new Set([
  'entry', 'identifier', 'name', 'given', 'prefix', 'suffix', 'telecom', 'address', 'line', 'coding', 'category',
  'interpretation', 'referenceRange', 'component', 'dosageInstruction', 'dosage', 'doseAndRate', 'reaction', 'manifestation',
  'participant', 'performer', 'result', 'hasMember', 'contained', 'extension', 'link', 'note', 'section', 'reasonCode',
  'reasonReference', 'diagnosis', 'contact', 'communication', 'profile', 'author', 'basedOn', 'partOf',
]);
const NAMED_PEOPLE = new Set(['Patient', 'Practitioner', 'RelatedPerson', 'Person']);
const NUMERIC_KEYS = new Set(['frequency', 'period', 'periodMax', 'frequencyMax', 'total', 'count', 'sequence', 'valueInteger', 'valueDecimal', 'rank']);
const QUANTITY_PARENTS = /quantity$|^(low|high|numerator|denominator|valueRange|age)$/i;

function primitive(key: string, parent: string, value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const numeric = NUMERIC_KEYS.has(key) || (key === 'value' && QUANTITY_PARENTS.test(parent));
  return numeric && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : value;
}

function isList(key: string, parent: string): boolean {
  // `type` and `location` repeat on Encounter only; `name` repeats on people but not on organizations.
  if (key === 'type' || key === 'location') return parent === 'Encounter';
  if (key === 'name') return NAMED_PEOPLE.has(parent);
  return ARRAY_KEYS.has(key);
}

/**
 * Converts FHIR XML into the FHIR JSON shape so one parser serves both syntaxes.
 * `origin` remembers which XML element each resource came from, for the raw inspector.
 */
export function fhirXmlToJson(root: XmlElement, origin: WeakMap<Obj, XmlElement>): Obj {
  const convertResource = (element: XmlElement): Obj => {
    const resource: Obj = { resourceType: element.localName, ...convertChildren(element, element.localName ?? '') };
    origin.set(resource, element);
    return resource;
  };

  const convert = (element: XmlElement, parent: string): unknown => {
    const key = element.localName ?? '';
    const children = elementChildren(element);
    if (key === 'div') return serializeXml(element);
    if ((key === 'resource' || key === 'contained') && children.length === 1) return convertResource(children[0]);
    const value = attr(element, 'value') ?? element.getAttribute('value');
    if (children.length === 0 && value !== null && value !== undefined) return primitive(key, parent, value);
    const object = convertChildren(element, key);
    const id = attr(element, 'id');
    if (id) object.id = id;
    const url = attr(element, 'url');
    if (url) object.url = url;
    return object;
  };

  const convertChildren = (element: XmlElement, parentKey: string): Obj => {
    const object: Obj = {};
    for (const childElement of elementChildren(element)) {
      const key = childElement.localName ?? '';
      const value = convert(childElement, parentKey);
      const existing = object[key];
      if (existing === undefined) object[key] = isList(key, parentKey) ? [value] : value;
      else if (Array.isArray(existing)) existing.push(value);
      else object[key] = [existing, value];
    }
    return object;
  };

  return convertResource(root);
}
