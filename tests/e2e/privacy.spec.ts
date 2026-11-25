import { expect, test, type Request } from '@playwright/test';
import { clearFile, dropSample, openApp, sampleText, SAMPLE_FILES, switchTab } from './helpers';

/** In-memory URLs never leave the browser; everything else counts as a network request. */
const isNetwork = (request: Request) => !/^(blob|data):/.test(request.url());

test.describe('privacy guarantees', () => {
  test('CRITICAL: zero network requests after the initial page load', async ({ page, context }) => {
    await openApp(page);

    const requests: string[] = [];
    // The context-level listener also sees requests made by the service worker and web workers.
    context.on('request', (request) => {
      if (isNetwork(request)) requests.push(`${request.method()} ${request.url()}`);
    });
    page.on('websocket', (socket) => requests.push(`WEBSOCKET ${socket.url()}`));

    for (const sample of ['fhir', 'hl7', 'ccda'] as const) {
      await dropSample(page, sample);

      await switchTab(page, 'Visual Map');
      await expect(page.getByTestId('graph-node').first()).toBeVisible();
      await switchTab(page, 'Dev View');
      await page.getByTestId('keyword-input').fill('a');
      await expect(page.getByTestId('source-item').first()).toBeVisible();
      await switchTab(page, 'Simple Report');
      await expect(page.getByTestId('lab-row').first()).toBeVisible();

      await page.getByTestId('open-scrubber').click();
      await expect(page.getByTestId('scrub-diff')).toBeVisible();
      await page.getByTestId('scrub-apply').click();
      await expect(page.getByTestId('patient-name')).toContainText('Patient');

      await switchTab(page, 'Visual Map');
      const [svg] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-svg').click()]);
      expect(svg.suggestedFilename()).toMatch(/-map\.svg$/);
      const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-png').click()]);
      expect(png.suggestedFilename()).toMatch(/-map\.png$/);

      await page.getByTestId('open-print').click();
      await expect(page.getByTestId('print-preview')).toBeVisible();
      await page.keyboard.press('Escape');

      await page.getByTestId('trust-pill').click();
      await expect(page.getByTestId('privacy-modal')).toBeVisible();
      await page.keyboard.press('Escape');

      await clearFile(page);
    }

    // Sample chips are bundled, so even those load without a request.
    await page.getByTestId('sample-fhir').click();
    await expect(page.getByTestId('workspace')).toBeVisible();
    await page.waitForTimeout(500);

    expect(requests).toEqual([]);
  });

  test('works in airplane mode after one visit', async ({ page, context }) => {
    await openApp(page);
    await context.setOffline(true);
    await page.reload();

    await expect(page.getByTestId('network-status')).toHaveText('Offline Verified');
    await dropSample(page, 'ccda');
    await expect(page.getByTestId('patient-name')).toHaveText('Eleanor M. Whitfield');

    await switchTab(page, 'Visual Map');
    await expect(page.getByTestId('graph-node').first()).toBeVisible();
    await switchTab(page, 'Dev View');
    await expect(page.getByTestId('source-tree')).toBeVisible();
    await switchTab(page, 'Simple Report');

    await page.getByTestId('open-scrubber').click();
    await page.getByTestId('scrub-apply').click();
    await expect(page.getByTestId('patient-name')).toContainText('Patient');

    await page.getByTestId('open-print').click();
    await expect(page.getByTestId('print-document').first()).toContainText('Clinical Summary');
    await page.keyboard.press('Escape');

    await page.getByTestId('trust-pill').click();
    await expect(page.getByTestId('offline-proof')).toContainText('OFFLINE VERIFIED');
    await expect(page.getByTestId('offline-proof')).toHaveAttribute('data-online', 'false');
  });

  test('the proof box reacts live when the connection drops', async ({ page, context }) => {
    await openApp(page);
    await page.getByTestId('trust-pill').click();
    await expect(page.getByTestId('offline-proof')).toContainText('Test it yourself');
    await context.setOffline(true);
    await expect(page.getByTestId('offline-proof')).toContainText('OFFLINE VERIFIED');
    await context.setOffline(false);
    await expect(page.getByTestId('offline-proof')).toContainText('Test it yourself');
  });

  test('patient data is never persisted and Clear File wipes it', async ({ page }) => {
    await openApp(page);
    await dropSample(page, 'fhir');
    await switchTab(page, 'Dev View');
    await switchTab(page, 'Simple Report');
    await page.getByTestId('open-scrubber').click();
    await page.getByTestId('scrub-apply').click();
    await page.getByTestId('open-scrubber').click();
    await page.getByTestId('scrub-revert').click();
    await expect(page.getByTestId('patient-name')).toHaveText('Marcus J. Delgado');

    const stored = await page.evaluate(async () => {
      const databases = await indexedDB.databases();
      const cacheKeys = await caches.keys();
      const cached: string[] = [];
      for (const key of cacheKeys) {
        const cache = await caches.open(key);
        for (const request of await cache.keys()) cached.push(request.url);
      }
      return {
        local: JSON.stringify({ ...localStorage }),
        session: JSON.stringify({ ...sessionStorage }),
        cookies: document.cookie,
        databases: databases.map((db) => db.name ?? ''),
        cached,
      };
    });

    const secrets = ['Delgado', 'Marcus', 'MRN-48213907', '000-12-3456', '1968-08-14', 'Penicillin', 'Metformin'];
    const everything = JSON.stringify(stored);
    for (const secret of secrets) expect(everything, `"${secret}" must not be persisted`).not.toContain(secret);
    expect(stored.session).toBe('{}');
    expect(stored.cookies).toBe('');
    // Only non-sensitive UI preferences may live in localStorage.
    expect(Object.keys(JSON.parse(stored.local)).every((key) => key.startsWith('medview:'))).toBe(true);
    // The service-worker cache holds the app shell only.
    expect(stored.cached.every((url) => /\.(html|js|css|svg|woff2|webmanifest)(\?|$)|\/medview\/$/.test(url))).toBe(true);

    await clearFile(page);
    await expect(page.locator('body')).not.toContainText('Delgado');

    await dropSample(page, 'fhir');
    await page.reload();
    await expect(page.getByTestId('drop-zone')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Delgado');
  });

  test('ships the strict Content-Security-Policy', async ({ page }) => {
    await page.goto('./');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("object-src 'none'");
    // A request to another origin is refused by the browser itself.
    const blocked = await page.evaluate(() => fetch('https://example.com/').then(() => false, () => true));
    expect(blocked).toBe(true);
  });
});

test('every sample file is recognized without choosing a format', async ({ page }) => {
  await openApp(page);
  const expected = { fhir: 'FHIR R4', hl7: 'HL7 v2.5.1', ccda: 'C-CDA' } as const;
  for (const sample of ['fhir', 'hl7', 'ccda'] as const) {
    // A misleading extension proves detection looks at content, not at the file name.
    await page.getByTestId('file-input').setInputFiles({ name: 'export.txt', mimeType: 'text/plain', buffer: Buffer.from(sampleText(SAMPLE_FILES[sample])) });
    await expect(page.getByTestId('format-badge')).toContainText(expected[sample]);
    await clearFile(page);
  }
});
