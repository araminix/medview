import { convertHealthExport, isHealthExport } from './appleHealth';
import { parseCcda } from './ccda/parseCcda';
import { decodeFile, stripBom } from './decode';
import { detectSyntax } from './detect';
import { parseFhir } from './fhir/parseFhir';
import { fhirXmlToJson } from './fhir/xmlToJson';
import { parseHl7 } from './hl7v2/parseHl7';
import { findComposition, isFlatOpenEhr, parseOpenEhr } from './openehr/parseOpenEhr';
import { openEhrXmlToJson } from './openehr/xmlToJson';
import { isObj, type Obj } from './shared/access';
import { parseXml, serializeXml, type XmlElement } from './shared/xml';
import { UnreadableFileError, type ParsedDocument } from './types';

export { UnreadableFileError, type ParsedDocument } from './types';

const FHIR_NAMESPACE = 'http://hl7.org/fhir';

function lineOfOffset(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function parseJson(text: string): ParsedDocument {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const position = /position (\d+)/.exec(message)?.[1];
    const where = position ? `Problem near line ${lineOfOffset(text, Number(position))}.` : 'The file may have been cut off while downloading.';
    throw new UnreadableFileError('This JSON file is damaged or incomplete', where);
  }
  if (isObj(root) && typeof root.resourceType === 'string') return parseFhir(root, 'json');
  if (findComposition(root)) return parseOpenEhr(root, 'json');
  if (isFlatOpenEhr(root)) {
    throw new UnreadableFileError('This openEHR file is in the flat format', 'MedView reads canonical openEHR compositions. Export the composition as canonical JSON or XML.');
  }
  if (isObj(root) && ('archetype_node_id' in root || '_type' in root)) {
    throw new UnreadableFileError('This openEHR file is not a composition', 'MedView reads whole compositions, not single entries or templates.');
  }
  throw new UnreadableFileError('This JSON file is not a FHIR resource', 'A FHIR file has a "resourceType" such as Bundle or Patient.');
}

function parseXmlDocument(text: string): ParsedDocument {
  const document = parseXml(text);
  const root = document.documentElement!;
  if (root.localName === 'ClinicalDocument') return parseCcda(document);
  if (root.namespaceURI === FHIR_NAMESPACE) {
    const origin = new WeakMap<Obj, XmlElement>();
    return parseFhir(fhirXmlToJson(root, origin), 'xml', (resource) => {
      const element = origin.get(resource);
      return element ? serializeXml(element) : undefined;
    });
  }
  if (root.localName === 'composition') {
    const origin = new WeakMap<Obj, XmlElement>();
    return parseOpenEhr(openEhrXmlToJson(root, origin), 'xml', (node) => {
      const element = origin.get(node);
      return element ? serializeXml(element) : undefined;
    });
  }
  throw new UnreadableFileError(`Unrecognized XML document <${root.localName}>`, 'MedView reads FHIR XML, C-CDA (<ClinicalDocument>), openEHR (<composition>) and Apple Health files.');
}

/** Detects the format from content and parses it into the universal ClinicalRecord. */
export function parseText(text: string): ParsedDocument {
  // A BOM or blank lines before an XML declaration would otherwise be a fatal XML error.
  const body = stripBom(text).trimStart();
  if (isHealthExport(body)) return parseJson(convertHealthExport(body));
  switch (detectSyntax(body)) {
    case 'json':
      return parseJson(body);
    case 'xml':
      return parseXmlDocument(body);
    case 'hl7':
      return parseHl7(body);
    default:
      throw new UnreadableFileError(
        body.trim() ? 'This file format is not recognized' : 'This file is empty',
        'MedView reads FHIR (JSON or XML), HL7 v2, C-CDA, IPS and Apple Health files.',
      );
  }
}

/** Entry point for dropped files: decode bytes (BOM, encodings, zip) and parse. */
export function parseBytes(bytes: Uint8Array, onDecoded?: () => void): { document: ParsedDocument; text: string } {
  const { text, archiveNote } = decodeFile(bytes);
  onDecoded?.();
  const document = parseText(text);
  if (archiveNote) document.record.meta.warnings.unshift({ message: archiveNote, severity: 'info' });
  return { document, text };
}
