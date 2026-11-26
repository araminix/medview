/**
 * Plain-language guidance for people without medical training.
 * It explains and suggests everyday habits; it never diagnoses or prescribes.
 */

/** emergency: seek urgent care · soon: book a doctor's visit · routine: keep an eye on it. */
export type Urgency = 'emergency' | 'soon' | 'routine';

export interface Evidence {
  /** What was found, in plain words: "Blood sugar (HbA1c): 8.4 %". */
  label: string;
  /** How it compares: "higher than the usual range (4 – 5.6)". */
  detail?: string;
  date?: string;
}

export interface TopicContent {
  id: string;
  /** Plain headline, addressed to the reader: "Your blood sugar is high". */
  title: string;
  /** One or two sentences on what this means for the body. */
  meaning: string;
  /** Everyday habits that generally help. Food and lifestyle only — never medicines. */
  selfCare: string[];
  /** Questions worth bringing to a doctor or pharmacist. */
  askDoctor: string[];
}

export interface Finding extends TopicContent {
  urgency: Urgency;
  evidence: Evidence[];
  /** Why this was raised to an emergency, when it was. */
  urgentReason?: string;
}

export interface PlainSummary {
  /** Most urgent first. */
  findings: Finding[];
  /** The most serious urgency present, or "clear" when nothing needs attention. */
  overall: Urgency | 'clear';
  /** Active conditions the rules have no plain explanation for. */
  otherConditions: string[];
  /** Out-of-range results the rules have no plain explanation for. */
  otherResults: Evidence[];
}
