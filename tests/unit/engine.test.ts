import { describe, expect, test } from 'vitest';
import { Engine } from '@/engine/engine';
import type { LoadStage } from '@/engine/api';
import { DEFAULT_SCRUB_OPTIONS } from '@/scrubber';
import { sample } from './helpers';

const bytes = (name: string) => new TextEncoder().encode(sample(name));

describe('engine', () => {
  test('reports load stages in order', () => {
    const stages: LoadStage[] = [];
    new Engine((stage) => stages.push(stage)).load(bytes('messy-lab.hl7'));
    expect(stages).toEqual(['decoding', 'parsing', 'rendering']);
  });

  test('searches raw sources by keyword', () => {
    const engine = new Engine();
    engine.load(bytes('complex-care.fhir.json'));
    expect(engine.search('metformin')).toEqual(['MedicationRequest/med-metformin']);
    expect(engine.search('  ')).toEqual([]);
    expect(engine.rawText(20)).toMatchObject({ truncated: true, text: expect.stringContaining('"resourceType"') });
  });

  test('evaluates FHIRPath and reports syntax errors', () => {
    const engine = new Engine();
    engine.load(bytes('complex-care.fhir.json'));
    const high = engine.fhirPath("entry.resource.ofType(Observation).where(interpretation.coding.code = 'H').code.text");
    expect(high.total).toBe(6);
    expect(high.values[0]).toBe('Hemoglobin A1c');
    expect(engine.fhirPath('entry..').error).toContain('Parse error');
  });

  test('FHIRPath is refused for non-FHIR files', () => {
    const engine = new Engine();
    engine.load(bytes('messy-lab.hl7'));
    expect(engine.fhirPath('PID').error).toBe('FHIRPath is available for FHIR files only.');
  });

  test('applies and reverts scrubbing', () => {
    const engine = new Engine();
    expect(engine.load(bytes('discharge-summary.ccda.xml')).scrubbed).toBe(false);
    const scrubbed = engine.applyScrub(DEFAULT_SCRUB_OPTIONS);
    expect(scrubbed.scrubbed).toBe(true);
    expect(scrubbed.record.patient.name).toMatch(/^Patient/);
    expect(engine.getSource(scrubbed.record.patient.sourceId!)).not.toContain('Whitfield');
    // Scrubbing again always starts from the original file, never from scrubbed output.
    expect(engine.previewScrub(DEFAULT_SCRUB_OPTIONS).some((c) => c.original === 'Whitfield')).toBe(true);
    expect(engine.revertScrub()).toMatchObject({ scrubbed: false, record: { patient: { name: 'Eleanor M. Whitfield' } } });
  });

  test('safe summary contains clinical facts but no identity', () => {
    const engine = new Engine();
    engine.load(bytes('complex-care.fhir.json'));
    const summary = engine.safeSummary(DEFAULT_SCRUB_OPTIONS);
    expect(summary).toContain('Hemoglobin A1c: 8.4 % ↑');
    expect(summary).toContain('Penicillin — Anaphylaxis');
    expect(summary).not.toMatch(/Delgado|Marcus|1968-08-14|MRN-48213907/);
  });

  test('refuses work before a file is open', () => {
    expect(() => new Engine().search('x')).toThrow('No file is open');
  });
});
