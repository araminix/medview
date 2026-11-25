import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openApp, switchTab } from './helpers';

const RESOURCES = 12_000;
const TARGET_BYTES = 50 * 1024 * 1024;

/** A synthetic FHIR bundle: one patient, a few encounters and thousands of padded observations. */
function buildLargeBundle(): string {
  const padding = 'Synthetic narrative padding for load testing. '.repeat(Math.ceil(TARGET_BYTES / RESOURCES / 46));
  const tests: Array<[string, string, string, number, number]> = [
    ['718-7', 'Hemoglobin', 'g/dL', 12, 15.5],
    ['2160-0', 'Creatinine', 'mg/dL', 0.6, 1.1],
    ['2345-7', 'Glucose', 'mg/dL', 70, 99],
    ['2823-3', 'Potassium', 'mmol/L', 3.5, 5.1],
    ['1742-6', 'ALT', 'U/L', 7, 35],
  ];
  const entries: string[] = [
    JSON.stringify({ resource: { resourceType: 'Patient', id: 'big', name: [{ family: 'Loadtest', given: ['Pat'] }], birthDate: '1970-01-01', gender: 'female' } }),
  ];
  for (let e = 0; e < 20; e += 1) {
    entries.push(JSON.stringify({ resource: { resourceType: 'Encounter', id: `e${e}`, class: { code: 'AMB' }, subject: { reference: 'Patient/big' }, period: { start: `20${10 + (e % 15)}-03-0${(e % 9) + 1}` } } }));
  }
  for (let i = 0; i < RESOURCES; i += 1) {
    const [code, name, unit, low, high] = tests[i % tests.length];
    const value = Number((low + ((i * 7) % 20) * ((high - low) / 12)).toFixed(2));
    entries.push(
      JSON.stringify({
        resource: {
          resourceType: 'Observation',
          id: `o${i}`,
          status: 'final',
          category: [{ coding: [{ code: 'laboratory' }] }],
          code: { coding: [{ system: 'http://loinc.org', code, display: name }], text: name },
          subject: { reference: 'Patient/big' },
          encounter: { reference: `Encounter/e${i % 20}` },
          effectiveDateTime: `20${10 + (i % 15)}-0${(i % 9) + 1}-1${i % 9}`,
          valueQuantity: { value, unit },
          referenceRange: [{ low: { value: low }, high: { value: high } }],
          note: [{ text: padding }],
        },
      }),
    );
  }
  return `{"resourceType":"Bundle","type":"collection","entry":[${entries.join(',')}]}`;
}

test('a 50 MB bundle with 12,000 resources stays responsive', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const path = testInfo.outputPath('large-bundle.json');
  const bundle = buildLargeBundle();
  writeFileSync(path, bundle);
  expect(Buffer.byteLength(bundle)).toBeGreaterThan(TARGET_BYTES);

  await openApp(page);
  // Track the longest gap between animation frames: a frozen UI thread shows up as one long gap.
  await page.evaluate(() => {
    const state = { last: performance.now(), longest: 0 };
    (window as unknown as { __frames: typeof state }).__frames = state;
    const tick = (now: number) => {
      state.longest = Math.max(state.longest, now - state.last);
      state.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const started = Date.now();
  await page.getByTestId('file-input').setInputFiles(path);
  await expect(page.getByTestId('loading-panel')).toBeVisible();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeEnabled();

  await expect(page.getByTestId('simple-report')).toBeVisible({ timeout: 120_000 });
  const loadMs = Date.now() - started;
  const longestFrame = await page.evaluate(() => (window as unknown as { __frames: { longest: number } }).__frames.longest);
  console.log(`50 MB bundle: ready in ${loadMs} ms, longest UI frame gap ${Math.round(longestFrame)} ms`);

  await expect(page.getByTestId('format-badge')).toContainText('12,021 resources');
  // Parsing happens in the worker; the UI thread only pays for receiving and drawing the result.
  expect(longestFrame).toBeLessThan(3000);
  expect(loadMs).toBeLessThan(60_000);

  // Re-rendering the Simple Report from memory is well inside the 3 s budget.
  await switchTab(page, 'Dev View');
  await expect(page.getByTestId('source-tree')).toBeVisible();
  const renderStart = Date.now();
  await switchTab(page, 'Simple Report');
  await expect(page.getByTestId('lab-row').first()).toBeVisible();
  expect(Date.now() - renderStart).toBeLessThan(3000);

  // The graph clusters instead of drawing 12,000 nodes.
  await switchTab(page, 'Visual Map');
  await expect(page.getByTestId('cluster-note')).toBeVisible();
  await expect(page.getByTestId('graph-node').filter({ hasText: 'Observations × 12,000' })).toBeVisible();
  expect(await page.getByTestId('graph-node').count()).toBeLessThanOrEqual(200);
});

test('a large load can be cancelled', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const path = testInfo.outputPath('large-bundle.json');
  writeFileSync(path, buildLargeBundle());
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles(path);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('drop-zone')).toBeVisible();
  // The engine restarts cleanly: a normal file opens right after.
  await page.getByTestId('sample-hl7').click();
  await expect(page.getByTestId('patient-name')).toHaveText('Greta L Hartmann');
});
