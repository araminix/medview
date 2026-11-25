import ccda from './discharge-summary.ccda.xml?raw';
import fhir from './complex-care.fhir.json?raw';
import hl7 from './messy-lab.hl7?raw';

export interface SampleFile {
  id: string;
  label: string;
  fileName: string;
  content: string;
}

/**
 * Synthetic patients only — no real PHI. Bundled into the app so loading a sample
 * never triggers a network request.
 */
export const SAMPLES: SampleFile[] = [
  { id: 'ccda', label: 'US Hospital Discharge (C-CDA XML)', fileName: 'discharge-summary.ccda.xml', content: ccda },
  { id: 'fhir', label: 'Complex Care Bundle (FHIR R4 JSON)', fileName: 'complex-care.fhir.json', content: fhir },
  { id: 'hl7', label: 'Messy Lab Result Message (HL7 v2)', fileName: 'messy-lab.hl7', content: hl7 },
];
