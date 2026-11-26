import ccda from './discharge-summary.ccda.xml?raw';
import fhir from './complex-care.fhir.json?raw';
import hl7 from './messy-lab.hl7?raw';
import ips from './patient-summary.ips.json?raw';

export interface SampleFile {
  id: 'ccda' | 'fhir' | 'hl7' | 'ips';
  fileName: string;
  content: string;
}

/**
 * Synthetic patients only — no real PHI. Bundled into the app so loading a sample
 * never triggers a network request.
 */
export const SAMPLES: SampleFile[] = [
  { id: 'ccda', fileName: 'discharge-summary.ccda.xml', content: ccda },
  { id: 'fhir', fileName: 'complex-care.fhir.json', content: fhir },
  { id: 'hl7', fileName: 'messy-lab.hl7', content: hl7 },
  { id: 'ips', fileName: 'patient-summary.ips.json', content: ips },
];
