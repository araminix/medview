import { DOMParser, XMLSerializer, type Document, type Element, type Node } from '@xmldom/xmldom';
import { UnreadableFileError } from '../types';

export type { Document as XmlDocument, Element as XmlElement };

const ELEMENT_NODE = 1;

/**
 * Parses XML with xmldom because the browser DOMParser does not exist inside Web Workers.
 * Malformed input raises an UnreadableFileError carrying the line of the first problem.
 */
export function parseXml(text: string): Document {
  let firstProblem: string | undefined;
  try {
    const document = new DOMParser({
      onError: (level, message) => {
        if (level !== 'warning') firstProblem ??= message;
      },
    }).parseFromString(text, 'text/xml');
    if (!document.documentElement) throw new Error('Document has no root element');
    if (firstProblem) throw new Error(firstProblem);
    return document;
  } catch (error) {
    const detail = (firstProblem ?? (error instanceof Error ? error.message : String(error))).split('\n')[0];
    throw new UnreadableFileError('This XML file is damaged or incomplete', detail);
  }
}

export function serializeXml(node: Node): string {
  return new XMLSerializer().serializeToString(node);
}

export function isElement(node: Node | null | undefined): node is Element {
  return node?.nodeType === ELEMENT_NODE;
}

export function elementChildren(parent: Element | Document, name?: string): Element[] {
  const result: Element[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (isElement(node) && (!name || node.localName === name)) result.push(node);
  }
  return result;
}

export function child(parent: Element | undefined, name: string): Element | undefined {
  if (!parent) return undefined;
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (isElement(node) && node.localName === name) return node;
  }
  return undefined;
}

/** Follows a slash-separated path of child element names: find(el, 'patientRole/patient/name'). */
export function find(root: Element | undefined, path: string): Element | undefined {
  let current = root;
  for (const name of path.split('/')) current = child(current, name);
  return current;
}

/** All elements matching the last path step under every match of the preceding steps. */
export function findAll(root: Element | undefined, path: string): Element[] {
  let current: Element[] = root ? [root] : [];
  for (const name of path.split('/')) current = current.flatMap((el) => elementChildren(el, name));
  return current;
}

export function attr(element: Element | undefined, name: string): string | undefined {
  return element?.getAttribute(name)?.trim() || undefined;
}

export function textOf(element: Element | undefined): string | undefined {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || undefined;
}

export function descendants(root: Element, visit: (element: Element) => void): void {
  for (const element of elementChildren(root)) {
    visit(element);
    descendants(element, visit);
  }
}
