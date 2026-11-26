import type { Obj } from '../shared/access';
import { elementChildren, type XmlElement } from '../shared/xml';

const NUMERIC = new Set(['magnitude', 'numerator', 'denominator', 'precision']);

/**
 * Converts canonical openEHR XML to the canonical JSON shape, so one reader serves both.
 * `xsi:type` becomes `_type`; a repeated child becomes a list.
 */
export function openEhrXmlToJson(root: XmlElement, origin: WeakMap<Obj, XmlElement>): Obj {
  const convert = (element: XmlElement): unknown => {
    const children = elementChildren(element);
    if (children.length === 0) {
      const text = element.textContent?.trim() ?? '';
      return NUMERIC.has(element.localName ?? '') && text !== '' && Number.isFinite(Number(text)) ? Number(text) : text;
    }
    const object: Obj = {};
    const type = element.getAttribute('xsi:type') ?? element.getAttribute('type');
    if (type) object._type = type.replace(/^.*:/, '');
    const nodeId = element.getAttribute('archetype_node_id');
    if (nodeId) object.archetype_node_id = nodeId;
    for (const child of children) {
      const key = child.localName ?? '';
      const value = convert(child);
      const existing = object[key];
      if (existing === undefined) object[key] = value;
      else if (Array.isArray(existing)) existing.push(value);
      else object[key] = [existing, value];
    }
    origin.set(object, element);
    return object;
  };
  const composition = convert(root) as Obj;
  composition._type ??= 'COMPOSITION';
  return composition;
}
