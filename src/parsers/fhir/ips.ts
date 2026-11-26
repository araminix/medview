import { isObj, objs, pick, str, type Obj } from '../shared/access';

/** LOINC code of the "Patient summary document" that every International Patient Summary carries. */
const IPS_DOCUMENT = '60591-5';
const IPS_PROFILE = '/uv/ips/';
/** Code system IPS uses to say "nothing to report" (no-known-allergies, no-medication-info…). */
const ABSENT_SYSTEM = 'absent-unknown';

function profiles(resource: Obj): string[] {
  const list = pick(resource, 'meta.profile');
  return (Array.isArray(list) ? list : [list]).flatMap((p) => str(p) ?? []);
}

/** An International Patient Summary is a FHIR document bundle whose Composition is a patient summary. */
export function isPatientSummary(root: Obj): boolean {
  if (root.resourceType !== 'Bundle') return false;
  if (profiles(root).some((p) => p.includes(IPS_PROFILE))) return true;
  return objs(root.entry).some(({ resource }) => {
    if (!isObj(resource) || resource.resourceType !== 'Composition') return false;
    return profiles(resource).some((p) => p.includes(IPS_PROFILE)) || objs(pick(resource, 'type.coding')).some((c) => c.code === IPS_DOCUMENT);
  });
}

/**
 * IPS requires every section, so "no known allergies" arrives as a real AllergyIntolerance
 * with an absent-unknown code. Returns that statement instead of letting it look like a finding.
 */
export function absentStatement(resource: Obj): string | undefined {
  const concepts = [resource.code, resource.medicationCodeableConcept, pick(resource, 'medication.concept'), resource.vaccineCode];
  for (const concept of concepts) {
    const coding = objs(pick(concept, 'coding')).find((c) => str(c.system)?.includes(ABSENT_SYSTEM));
    if (coding) return str(coding.display) ?? str(pick(concept, 'text')) ?? str(coding.code)?.replace(/-/g, ' ');
  }
  return undefined;
}
