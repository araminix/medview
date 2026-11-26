/**
 * The one internal schema every parser targets. UI code never looks at
 * FHIR / HL7 v2 / C-CDA structures directly — only at a ClinicalRecord.
 */

export type RecordFormat =
  | 'fhir-r4'
  | 'fhir-r5'
  | 'hl7-v2'
  | 'ccda'
  | 'eu-ips'
  | 'openehr'
  | 'dicom'
  | 'apple-health';

export type BodySystem =
  | 'neuro'
  | 'cardio'
  | 'respiratory'
  | 'gi'
  | 'renal'
  | 'blood'
  | 'endocrine'
  | 'musculoskeletal'
  | 'general';

export type LabFlag = 'low' | 'normal' | 'high' | 'critical' | 'abnormal' | 'unknown';

export type ClinicalStatus = 'active' | 'inactive' | 'unknown';

export interface ParseWarning {
  message: string;
  /** JSON path, HL7 segment position or XML location, e.g. "entry[4].resource" or "OBX[3]-6". */
  path?: string;
  line?: number;
  severity: 'info' | 'warning' | 'error';
}

export interface Coding {
  code: string;
  /** Short human name of the code system: ICD-10, SNOMED, LOINC, RxNorm, CVX… */
  system?: string;
  display?: string;
}

/** Fields shared by every clinical item so the UI can link back to the raw source. */
export interface ItemBase {
  id: string;
  /** Key into ClinicalRecord.sources. */
  sourceId?: string;
  codes: Coding[];
}

export interface IdItem {
  label: string;
  value: string;
}

export interface PatientInfo {
  name?: string;
  dob?: string;
  age?: number;
  sex?: string;
  deceased?: boolean;
  identifiers: IdItem[];
  contacts: string[];
  sourceId?: string;
}

export interface AllergyItem extends ItemBase {
  substance: string;
  reaction?: string;
  severity?: string;
  status: ClinicalStatus;
  date?: string;
}

export interface LabItem extends ItemBase {
  name: string;
  /** Numeric value when the result is a number (or a comparator like "<0.01"). */
  value?: number;
  /** The result exactly as reported: "8.4", "Positive", "<0.01". */
  valueText: string;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  refText?: string;
  flag: LabFlag;
  date?: string;
  panel?: string;
  bodySystem: BodySystem;
}

export type VitalItem = LabItem;

export interface MedItem extends ItemBase {
  name: string;
  /** Plain-English dosage, e.g. "500 mg — twice daily". */
  dosage?: string;
  route?: string;
  status: ClinicalStatus;
  date?: string;
  prescriber?: string;
}

export interface ConditionItem extends ItemBase {
  name: string;
  status: ClinicalStatus;
  onset?: string;
  resolved?: string;
  bodySystem: BodySystem;
}

export interface EncounterItem extends ItemBase {
  kind: string;
  title: string;
  start?: string;
  end?: string;
  location?: string;
  provider?: string;
  reason?: string;
}

export interface ImmunizationItem extends ItemBase {
  name: string;
  date?: string;
  status?: string;
}

export interface ProcedureItem extends ItemBase {
  name: string;
  date?: string;
  status?: string;
  bodySystem: BodySystem;
}

export interface ClinicalNoteItem extends ItemBase {
  title: string;
  date?: string;
  /** Untrusted narrative HTML/text from the file. Always sanitize before rendering. */
  html?: string;
  text?: string;
}

export type GraphNodeKind =
  | 'patient'
  | 'encounter'
  | 'condition'
  | 'observation'
  | 'medication'
  | 'allergy'
  | 'report'
  | 'practitioner'
  | 'organization'
  | 'immunization'
  | 'procedure'
  | 'other';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  sublabel?: string;
  abnormal?: boolean;
  sourceId?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

/** Lightweight index entry of one raw unit (FHIR resource, HL7 segment, C-CDA section). */
export interface SourceRef {
  id: string;
  type: string;
  label: string;
}

export interface RecordMeta {
  format: RecordFormat;
  version?: string;
  /** Human format badge, e.g. "FHIR R4 · 142 resources". */
  summary: string;
  syntax: 'json' | 'xml' | 'hl7' | 'dicom';
  /** True when the file is FHIR underneath, so FHIRPath queries can run on it. */
  fhirPath?: boolean;
  warnings: ParseWarning[];
}

/** What a DICOM file or series holds, for the image viewer. The pictures themselves stay in the engine. */
export interface ImagingInfo {
  /** Number of pictures that can be shown, across the files of the series. */
  frames: number;
  width: number;
  height: number;
  /** True for greyscale pictures, whose brightness window can be changed. */
  greyscale: boolean;
  /** Why no picture can be shown, when none can. */
  unavailable?: string;
  /** Facts about the study and the scanner, in reading order. */
  details: IdItem[];
}

export interface ClinicalRecord {
  meta: RecordMeta;
  /** Present for DICOM files only. */
  imaging?: ImagingInfo;
  patient: PatientInfo;
  allergies: AllergyItem[];
  labs: LabItem[];
  vitals: VitalItem[];
  medications: MedItem[];
  conditions: ConditionItem[];
  encounters: EncounterItem[];
  immunizations: ImmunizationItem[];
  procedures: ProcedureItem[];
  documents: ClinicalNoteItem[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  sources: SourceRef[];
}
