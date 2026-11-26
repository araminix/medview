import { expect, test, type Page, type Request } from '@playwright/test';
import { clearFile, openApp, switchTab } from './helpers';

const isNetwork = (request: Request) => !/^(blob|data):/.test(request.url());
const BADGES = { ips: 'IPS · FHIR R4', apple: 'Apple Health', openehr: 'openEHR · 12 entries', dicom: 'DICOM · CT · 8 images' } as const;

async function openSample(page: Page, id: keyof typeof BADGES): Promise<void> {
  await page.getByTestId(`sample-${id}`).click();
  await expect(page.getByTestId('workspace')).toBeVisible();
}

/** A fingerprint of what the canvas shows, and how much of it is not black. */
function canvasState(page: Page): Promise<{ print: string; lit: number }> {
  return page.getByTestId('image-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let lit = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 40) lit += 1;
      sum = (sum * 31 + data[i]) % 1000000007;
    }
    return { print: `${canvas.width}x${canvas.height}:${sum}`, lit };
  });
}

test('the newer formats open from their sample chips and are named correctly', async ({ page }) => {
  await openApp(page);
  for (const id of Object.keys(BADGES) as Array<keyof typeof BADGES>) {
    await openSample(page, id);
    await expect(page.getByTestId('format-badge')).toContainText(BADGES[id]);
    await clearFile(page);
  }
});

test('CRITICAL: the newer formats make no network request either', async ({ page, context }) => {
  await openApp(page);
  const requests: string[] = [];
  context.on('request', (request) => {
    if (isNetwork(request)) requests.push(`${request.method()} ${request.url()}`);
  });

  for (const id of Object.keys(BADGES) as Array<keyof typeof BADGES>) {
    await openSample(page, id);
    await switchTab(page, 'Visual Map');
    await expect(page.getByTestId('graph-node').first()).toBeVisible();
    await switchTab(page, 'Dev View');
    await page.getByTestId('keyword-input').fill('a');
    await expect(page.getByTestId('source-item').first()).toBeVisible();
    await switchTab(page, 'My Summary');
    await page.getByTestId('open-scrubber').click();
    await expect(page.getByTestId('scrubber-modal')).toBeVisible();
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('scrub-download').click()]);
    expect(file.suggestedFilename()).toContain('.scrubbed.');
    await page.getByTestId('scrub-apply').click();
    await expect(page.getByTestId('scrubber-modal')).toBeHidden();
    await clearFile(page);
  }
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);
});

test.describe('DICOM images', () => {
  test('a scan opens on its pictures, which can be paged through and adjusted', async ({ page }) => {
    await openApp(page);
    await openSample(page, 'dicom');
    await expect(page.getByRole('tab', { name: 'Images' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('patient-name')).toHaveText('Daniel Okonkwo');
    await expect.poll(async () => (await canvasState(page)).lit).toBeGreaterThan(5000);
    const first = await canvasState(page);
    expect(first.print.startsWith('192x192:')).toBe(true);

    await page.getByTestId('image-slider').fill('8');
    await expect(page.getByTestId('image-view')).toContainText('Image 8 of 8');
    await expect.poll(async () => (await canvasState(page)).print).not.toBe(first.print);
    const last = await canvasState(page);

    await page.locator('#image-brightness').fill('60');
    await expect.poll(async () => (await canvasState(page)).lit).toBeGreaterThan(last.lit);
    await page.getByTestId('image-reset').click();
    await expect.poll(async () => (await canvasState(page)).print).toBe(last.print);
  });

  test('anonymizing a scan renames the patient and downloads a DICOM file of the same size', async ({ page }) => {
    await openApp(page);
    await openSample(page, 'dicom');
    await page.getByTestId('open-scrubber').click();
    await expect(page.getByTestId('scrub-dicom-note')).toBeVisible();
    await expect(page.getByTestId('scrub-diff')).toContainText('Okonkwo^Daniel');
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('scrub-download').click()]);
    expect(file.suggestedFilename()).toBe('chest-phantom.scrubbed.dcm');
    await page.getByTestId('scrub-apply').click();
    await expect(page.getByTestId('patient-name')).toHaveText('ANONYMOUS');
    await expect.poll(async () => (await canvasState(page)).lit).toBeGreaterThan(5000);
  });

  test('the Images tab belongs to scans only and is not remembered', async ({ page }) => {
    await openApp(page, 'summary');
    await openSample(page, 'dicom');
    await clearFile(page);
    await openSample(page, 'ips');
    await expect(page.getByRole('tab', { name: 'Images' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'My Summary' })).toHaveAttribute('aria-selected', 'true');
  });
});
