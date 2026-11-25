import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { dropSample, openApp, switchTab } from './helpers';

test.beforeEach(async ({ page }) => openApp(page));

test.describe('Simple Report', () => {
  test('pins identity and allergies, and surfaces abnormal labs first', async ({ page }) => {
    await dropSample(page, 'fhir');
    await expect(page.getByTestId('patient-card')).toContainText('Marcus J. Delgado');
    await expect(page.getByTestId('patient-card')).toContainText('14 Aug 1968');
    await expect(page.getByTestId('allergies')).toContainText('Penicillin — Anaphylaxis');
    await expect(page.getByTestId('abnormal-labs').locator('li').first()).toContainText('Potassium');
    await expect(page.getByTestId('abnormal-labs')).toContainText('8.4 % ↑');
    await expect(page.getByTestId('lab-row').first()).toContainText('Hemoglobin A1c');
    await expect(page.getByTestId('medication').first()).toContainText('500 mg — twice daily');
  });

  test('body map highlights systems and filters the report', async ({ page }) => {
    // The discharge summary has cardiac and renal diagnoses.
    await dropSample(page, 'ccda');
    const heart = page.locator('[data-zone="cardio"]');
    const kidneys = page.locator('[data-zone="renal"]');
    await expect(heart).toHaveAttribute('data-tone', 'abnormal');
    await expect(kidneys).toHaveAttribute('data-tone', 'abnormal');
    await expect(page.locator('[data-zone="neuro"]')).toHaveAttribute('data-tone', 'none');
    await expect(page.getByTestId('condition')).toHaveCount(6);

    await heart.click();
    await expect(page.getByTestId('filter-banner')).toContainText('Heart / Cardio');
    await expect(page.getByTestId('condition')).toHaveCount(2);
    await expect(page.getByTestId('condition').first()).toContainText('heart failure');
    await expect(page.getByTestId('lab-row').filter({ hasText: 'NT-proBNP' })).toBeVisible();
    await expect(page.getByTestId('lab-row').filter({ hasText: 'Creatinine' })).toHaveCount(0);
    await expect(page.getByTestId('medication').filter({ hasText: 'Metformin' })).toHaveCount(0);
    await expect(page.getByTestId('medication').filter({ hasText: 'Furosemide' })).toBeVisible();

    await page.getByTestId('show-all').click();
    await expect(page.getByTestId('filter-banner')).toHaveCount(0);
    await expect(page.getByTestId('condition')).toHaveCount(6);
    await expect(page.getByTestId('lab-row').filter({ hasText: 'Creatinine' })).toBeVisible();

    // The legend offers the same filter to keyboard and screen-reader users.
    await page.getByTestId('zone-renal').click();
    await expect(page.getByTestId('condition')).toHaveCount(1);
  });

  test('scrubbing masks every tab and can be undone', async ({ page }) => {
    await dropSample(page, 'fhir');
    await page.getByTestId('open-scrubber').click();
    await expect(page.getByTestId('scrub-diff')).toContainText('Delgado');
    await page.getByTestId('scrub-apply').click();

    await expect(page.getByTestId('patient-name')).toContainText('Patient');
    await expect(page.getByTestId('patient-card')).not.toContainText('MRN-48213907');
    await expect(page.getByTestId('abnormal-labs')).toContainText('8.4 % ↑');
    await switchTab(page, 'Visual Map');
    await expect(page.getByTestId('visual-map')).not.toContainText('Delgado');
    await switchTab(page, 'Dev View');
    await expect(page.getByTestId('code-block').last()).not.toContainText('Delgado');
    await expect(page.getByTestId('code-block').last()).toContainText('"birthDate": "1968"');

    await page.getByTestId('open-scrubber').click();
    await page.getByTestId('scrub-revert').click();
    await expect(page.getByTestId('patient-name')).toHaveText('Marcus J. Delgado');
  });

  test('downloads a scrubbed file in the original syntax', async ({ page }) => {
    await dropSample(page, 'hl7');
    await page.getByTestId('open-scrubber').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('scrub-download').click()]);
    expect(download.suggestedFilename()).toBe('messy-lab.scrubbed.hl7');
    const text = readFileSync(await download.path(), 'utf8');
    expect(text.startsWith('MSH|^~\\&|')).toBe(true);
    expect(text).not.toMatch(/Hartmann|Greta|19590223|NG-7730155/);
    expect(text).toContain('|Alpha^Patient^L|');
  });
});

test.describe('print builder', () => {
  test('toggles hide sections and printing isolates the document', async ({ page }) => {
    await dropSample(page, 'fhir');
    await page.getByTestId('open-print').click();
    const preview = page.getByTestId('print-preview');
    await expect(preview.locator('[data-print-section="labs"]')).toContainText('Abnormal laboratory results');
    await expect(preview.locator('[data-print-section="timeline"]')).toHaveCount(0);
    await expect(preview).toContainText('Generated locally via MedView — Verify against official hospital source');

    await page.getByLabel('Active medications').uncheck();
    await expect(preview.locator('[data-print-section="medications"]')).toHaveCount(0);
    await page.getByLabel('Abnormal labs only').uncheck();
    await expect(preview.locator('[data-print-section="labs"] tbody tr')).toHaveCount(18);
    await page.getByLabel('Historical visits timeline').check();
    await expect(preview.locator('[data-print-section="timeline"]')).toContainText('Annual diabetes review');
    await page.getByLabel('Anonymize patient info before printing').check();
    await expect(preview).not.toContainText('Delgado');
    await expect(preview).toContainText('ALLERGIES: Penicillin');

    // Headless browsers have no print dialog; record what the page looks like when print() is called.
    await page.evaluate(() => {
      window.print = () => {
        const root = document.getElementById('root')!;
        (window as unknown as { __print: unknown }).__print = {
          printing: document.body.classList.contains('mv-printing'),
          document: document.querySelector('#print-root [data-testid="print-document"]')?.textContent ?? '',
          appHiddenInPrint: [...document.styleSheets].some((sheet) => [...sheet.cssRules].some((rule) => rule.cssText.includes('@media print') && rule.cssText.includes('body.mv-printing #root'))),
          rootPresent: Boolean(root),
        };
        window.dispatchEvent(new Event('afterprint'));
      };
    });
    await page.getByTestId('print-now').click();
    const printed = await page.evaluate(() => (window as unknown as { __print: { printing: boolean; document: string; appHiddenInPrint: boolean } }).__print);
    expect(printed.printing).toBe(true);
    expect(printed.appHiddenInPrint).toBe(true);
    expect(printed.document).toContain('Clinical Summary');
    expect(printed.document).not.toContain('Delgado');
    await expect(page.locator('body')).not.toHaveClass(/mv-printing/);
  });

  test('@media print hides navigation chrome', async ({ page }) => {
    await dropSample(page, 'fhir');
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('clear-file')).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Simple Report' })).toBeHidden();
    await expect(page.getByTestId('patient-card')).toBeHidden();
    await expect(page.getByTestId('simple-report')).toBeVisible();
  });
});

test.describe('Visual Map', () => {
  test('filters, selects and exports valid SVG and PNG files', async ({ page }) => {
    await dropSample(page, 'fhir');
    await switchTab(page, 'Visual Map');
    await expect(page.getByTestId('graph-node')).not.toHaveCount(0);
    await expect(page.locator('[data-kind="medication"]').first()).toBeAttached();

    await page.getByTestId('kind-medication').click();
    await expect(page.locator('[data-kind="medication"]')).toHaveCount(0);
    await page.getByTestId('abnormal-only').check();
    await expect(page.getByTestId('graph-node').filter({ hasText: 'Hemoglobin A1c' })).toBeVisible();
    await expect(page.getByTestId('graph-node').filter({ hasText: 'Creatinine' })).toHaveCount(0);

    await page.getByTestId('graph-node').filter({ hasText: 'Hemoglobin A1c' }).click();
    await expect(page.getByTestId('node-drawer')).toContainText('LOINC 4548-4');
    await expect(page.getByTestId('node-drawer').getByTestId('code-block')).toContainText('"resourceType": "Observation"');

    await page.getByTestId('toggle-direction').click();
    await expect(page.getByTestId('toggle-direction')).toContainText('Top → Bottom');

    const [svgDownload] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-svg').click()]);
    const svg = readFileSync(await svgDownload.path(), 'utf8');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('Hemoglobin A1c');
    expect(svg).not.toContain('var(--');

    const [pngDownload] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-png').click()]);
    const png = readFileSync(await pngDownload.path());
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.length).toBeGreaterThan(5000);
  });
});

test.describe('Dev View', () => {
  test('runs FHIRPath, reports errors and searches raw sources', async ({ page }) => {
    await dropSample(page, 'fhir');
    await switchTab(page, 'Dev View');
    await page.getByTestId('mode-fhirpath').click();
    await page.getByTestId('fhirpath-input').fill("entry.resource.ofType(Condition).where(clinicalStatus.coding.code = 'active').code.text");
    await page.getByTestId('fhirpath-run').click();
    await expect(page.getByTestId('fhirpath-results')).toContainText('5 results');
    await expect(page.getByTestId('fhirpath-results')).toContainText('Essential (primary) hypertension');

    await page.getByTestId('fhirpath-input').fill('entry..');
    await page.getByTestId('fhirpath-run').click();
    await expect(page.getByTestId('fhirpath-error')).toContainText('Parse error');

    await page.getByTestId('mode-search').click();
    await page.getByTestId('keyword-input').fill('metformin');
    await expect(page.getByTestId('source-item')).toHaveCount(1);
    await page.getByTestId('source-item').click();
    await expect(page.getByTestId('code-block').last()).toContainText('"resourceType": "MedicationRequest"');

    await page.getByTestId('pane-normalized').click();
    await expect(page.getByTestId('code-block').last()).toContainText('"format": "fhir-r4"');
    await page.getByTestId('pane-warnings').click();
    await expect(page.getByTestId('diagnostics')).toContainText('Unresolved reference: Practitioner/prac-991');
  });

  test('shows the HL7 segment tree and has no FHIRPath mode for non-FHIR files', async ({ page }) => {
    await dropSample(page, 'hl7');
    await switchTab(page, 'Dev View');
    await expect(page.getByTestId('mode-fhirpath')).toHaveCount(0);
    for (const segment of ['MSH', 'PID', 'OBR', 'OBX']) await expect(page.getByTestId('source-tree').locator('summary', { hasText: segment })).toBeVisible();
    await page.getByTestId('source-item').filter({ hasText: 'Result: Creatinine' }).click();
    await expect(page.getByTestId('code-block').last()).toContainText('OBX|2|NM|2160-0^Creatinine^LN||1.9|mg/dL|0.6-1.1|H');
  });
});
