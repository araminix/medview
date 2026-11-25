import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export const SAMPLE_FILES = {
  fhir: 'complex-care.fhir.json',
  hl7: 'messy-lab.hl7',
  ccda: 'discharge-summary.ccda.xml',
} as const;

export function sampleText(name: string): string {
  return readFileSync(new URL(`../../src/samples/${name}`, import.meta.url), 'utf8');
}

/** Opens the app and waits until the service worker has cached it and controls the page. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    }
  });
  await page.waitForLoadState('networkidle');
}

/** Loads a file the way a user does: through the file picker behind the drop zone. */
export async function dropFile(page: Page, name: string, content: string | Buffer): Promise<void> {
  await page.getByTestId('file-input').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) });
}

export async function dropSample(page: Page, sample: keyof typeof SAMPLE_FILES): Promise<void> {
  await dropFile(page, SAMPLE_FILES[sample], sampleText(SAMPLE_FILES[sample]));
  await expect(page.getByTestId('workspace')).toBeVisible();
}

export async function switchTab(page: Page, name: 'Simple Report' | 'Visual Map' | 'Dev View'): Promise<void> {
  await page.getByRole('tab', { name }).click();
}

export async function clearFile(page: Page): Promise<void> {
  await page.getByTestId('clear-file').click();
  await expect(page.getByTestId('drop-zone')).toBeVisible();
}
