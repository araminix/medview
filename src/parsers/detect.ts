export type DetectedSyntax = 'json' | 'xml' | 'hl7' | 'unknown';

const HL7_START = /^(MSH|FHS|BHS)[|^~\\&#!$%*+,\-./:;<=>?@[\]_`{}]/;
const HL7_SEGMENT = /^(MSH|PID|PV1|OBR|OBX|EVN|AL1|DG1|NK1|ORC)\|/m;

/** Looks at the content only — never the file extension — so pasted text and `.txt` files work. */
export function detectSyntax(text: string): DetectedSyntax {
  const head = text.trimStart().slice(0, 2000);
  if (head.startsWith('{') || head.startsWith('[')) return 'json';
  if (head.startsWith('<')) return 'xml';
  if (HL7_START.test(head) || HL7_SEGMENT.test(head)) return 'hl7';
  return 'unknown';
}
