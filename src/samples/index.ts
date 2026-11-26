import appleHealth from './apple-health-export.xml?raw';
import ccda from './discharge-summary.ccda.xml?raw';
import fhir from './complex-care.fhir.json?raw';
import openehr from './diabetes-review.openehr.json?raw';
import { buildDicomSample } from './dicomSample';
import hl7 from './messy-lab.hl7?raw';
import ips from './patient-summary.ips.json?raw';

export interface SampleFile {
  id: 'ccda' | 'fhir' | 'hl7' | 'ips' | 'apple' | 'openehr' | 'dicom';
  fileName: string;
  /** The file as text, or for a binary format a function that builds its bytes. */
  content: string | (() => Uint8Array);
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
  { id: 'apple', fileName: 'apple-health-export.xml', content: appleHealth },
  { id: 'openehr', fileName: 'diabetes-review.openehr.json', content: openehr },
  { id: 'dicom', fileName: 'chest-phantom.dcm', content: buildDicomSample },
];
