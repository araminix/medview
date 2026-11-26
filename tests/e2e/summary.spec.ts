import { expect, test } from '@playwright/test';
import { dropFile, dropSample, openApp, switchTab } from './helpers';

test('a first-time visitor lands on the plain-language summary', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('sample-fhir').click();
  await expect(page.getByRole('tab', { name: 'My Summary' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('summary-view')).toBeVisible();
});

test.describe('My Summary', () => {
  test.beforeEach(async ({ page }) => openApp(page, 'summary'));

  test('explains problems in everyday words, most urgent first', async ({ page }) => {
    await dropSample(page, 'fhir');
    await expect(page.getByTestId('summary-overall')).toHaveAttribute('data-overall', 'emergency');
    await expect(page.getByTestId('summary-allergies')).toContainText('You are allergic to: Penicillin (anaphylaxis)');

    const cards = page.getByTestId('finding');
    await expect(cards.first()).toHaveAttribute('data-urgency', 'emergency');
    await expect(cards.first()).toContainText('Your potassium level is outside the safe range');

    const sugar = page.locator('[data-topic="blood-sugar"]');
    await expect(sugar).toContainText('Your blood sugar is high');
    await expect(sugar).toContainText('Average blood sugar over 3 months (HbA1c): 8.4 %');
    await expect(sugar).toContainText('higher than the usual range');
    await expect(sugar).toContainText('What you can do yourself');
    await expect(sugar).toContainText('Walk for 10–15 minutes after meals');
    await expect(sugar).toContainText('Ask your doctor');

    // No clinical jargon leaks into this view.
    await expect(page.getByTestId('summary-view')).not.toContainText(/LOINC|ICD-10|SNOMED|RxNorm/);
    await expect(page.getByTestId('summary-medicines')).toContainText('Usually helps lower blood sugar');
    await expect(page.getByTestId('summary-view')).toContainText('not a diagnosis or medical advice');
  });

  test('an old critical result asks to check with a doctor; a fresh one sends to hospital', async ({ page }) => {
    await dropSample(page, 'fhir');
    await expect(page.locator('[data-topic="potassium"]').getByRole('alert')).toContainText('This result is not recent');

    const today = new Date().toISOString().slice(0, 10);
    const fresh = JSON.stringify({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'p', name: [{ text: 'Fresh Result' }] } },
        {
          resource: {
            resourceType: 'Observation', id: 'k', code: { text: 'Potassium' }, subject: { reference: 'Patient/p' }, effectiveDateTime: today,
            valueQuantity: { value: 6.8, unit: 'mmol/L' }, referenceRange: [{ low: { value: 3.5 }, high: { value: 5.1 } }],
          },
        },
      ],
    });
    await page.getByTestId('clear-file').click();
    await dropFile(page, 'fresh.json', fresh);
    const alert = page.locator('[data-topic="potassium"]').getByRole('alert');
    await expect(alert).toContainText('go to the nearest hospital emergency department or call your local emergency number now');
    await expect(alert).toContainText('Potassium at this level can disturb the heart rhythm');
  });

  test('a healthy file is reported as clear and links to the detailed report', async ({ page }) => {
    await dropFile(page, 'well.json', JSON.stringify({ resourceType: 'Patient', name: [{ text: 'Well Person' }] }));
    await expect(page.getByTestId('summary-overall')).toHaveAttribute('data-overall', 'clear');
    await expect(page.getByTestId('finding')).toHaveCount(0);
    await page.getByTestId('open-detailed-report').click();
    await expect(page.getByTestId('simple-report')).toBeVisible();
  });

  test('results without an explanation are still listed', async ({ page }) => {
    await dropSample(page, 'hl7');
    await expect(page.getByTestId('other-results')).toContainText('Calcium: 8.2 mg/dL');
    await expect(page.locator('[data-topic="kidneys"]')).toContainText('Do not take anti-inflammatory painkillers');
  });

  test('follows the scrubber like every other tab', async ({ page }) => {
    await dropSample(page, 'fhir');
    await page.getByTestId('open-scrubber').click();
    await page.getByTestId('scrub-apply').click();
    await expect(page.getByTestId('summary-view')).toContainText('Health summary for Patient');
    await expect(page.getByTestId('summary-view')).not.toContainText('Delgado');
  });
});

test('the page has exactly one scrollbar', async ({ page }) => {
  await openApp(page);
  await dropSample(page, 'fhir');
  for (const tab of ['My Summary', 'Simple Report', 'Dev View'] as const) {
    await switchTab(page, tab);
    // The document itself must never grow taller than the window; only the panel scrolls.
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), tab).toBe(0);
    expect(await page.evaluate(() => document.getElementById('root')!.scrollHeight - window.innerHeight), tab).toBe(0);
  }
});
