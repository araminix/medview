import { expect, test } from '@playwright/test';
import { dropFile, openApp, switchTab } from './helpers';

const PAYLOADS = ['<script>window.__xss = "script"</script>', '<img src=x onerror="window.__xss = \'img\'">', '<svg onload="window.__xss = \'svg\'"></svg>'];

const maliciousFhir = JSON.stringify({
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        id: 'evil',
        name: [{ text: `Mallory ${PAYLOADS[0]} ${PAYLOADS[1]}` }],
        identifier: [{ type: { text: PAYLOADS[1] }, value: PAYLOADS[2] }],
      },
    },
    {
      resource: {
        resourceType: 'Composition',
        id: 'note',
        title: `Note ${PAYLOADS[0]}`,
        date: '2025-01-01',
        section: [
          {
            title: 'History',
            text: {
              status: 'generated',
              div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>Safe paragraph</p>${PAYLOADS.join('')}<a href="javascript:window.__xss='link'">click me</a><iframe src="javascript:window.__xss='frame'"></iframe><p style="background:url(https://evil.example/pixel)">styled</p></div>`,
            },
          },
        ],
      },
    },
    {
      resource: {
        resourceType: 'Observation',
        id: 'o',
        code: { text: `Lab ${PAYLOADS[1]}` },
        subject: { reference: 'Patient/evil' },
        valueString: PAYLOADS[0],
      },
    },
    { resource: { resourceType: 'AllergyIntolerance', id: 'a', code: { text: PAYLOADS[1] }, patient: { reference: 'Patient/evil' } } },
  ],
});

const maliciousCcda = `<ClinicalDocument xmlns="urn:hl7-org:v3">
  <title>Evil &lt;script&gt;window.__xss = "title"&lt;/script&gt;</title>
  <recordTarget><patientRole><patient><name><given>&lt;img src=x onerror="window.__xss='ccda'"&gt;</given><family>Mallory</family></name></patient></patientRole></recordTarget>
  <component><structuredBody><component><section>
    <code code="8648-8"/><title>Course</title>
    <text><paragraph>&lt;script&gt;window.__xss = "narrative"&lt;/script&gt; plain text</paragraph></text>
  </section></component></structuredBody></component>
</ClinicalDocument>`;

test.describe('untrusted file content', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', () => {
      throw new Error('A dialog opened: injected script executed');
    });
    await openApp(page);
  });

  for (const [name, file, content] of [
    ['FHIR', 'evil.json', maliciousFhir],
    ['C-CDA', 'evil.xml', maliciousCcda],
  ] as const) {
    test(`${name}: scripts, event handlers and javascript: links never execute`, async ({ page }) => {
      await dropFile(page, file, content);
      await expect(page.getByTestId('workspace')).toBeVisible();
      await expect(page.getByTestId('patient-name')).toContainText('Mallory');

      // Visit every surface that renders file content.
      await page.getByTestId('open-print').click();
      await expect(page.getByTestId('print-preview')).toBeVisible();
      await page.keyboard.press('Escape');
      await switchTab(page, 'Visual Map');
      await page.getByTestId('graph-node').first().click();
      await expect(page.getByTestId('node-drawer')).toBeVisible();
      await switchTab(page, 'Dev View');
      await page.getByTestId('pane-normalized').click();
      await switchTab(page, 'Simple Report');
      await expect(page.getByTestId('simple-report')).toBeVisible();

      expect(await page.evaluate(() => (window as unknown as { __xss?: string }).__xss)).toBeUndefined();
      const dangerous = await page.evaluate(() => ({
        scripts: document.querySelectorAll('#root script, #root iframe, #root object, #root embed').length,
        handlers: [...document.querySelectorAll('#root *')].filter((el) => [...el.attributes].some((a) => a.name.startsWith('on'))).length,
        links: [...document.querySelectorAll('#root a')].filter((a) => /^\s*javascript:/i.test(a.getAttribute('href') ?? '')).length,
        narrativeImages: document.querySelectorAll('.narrative img, .narrative svg, .narrative a, .narrative [style]').length,
      }));
      expect(dangerous).toEqual({ scripts: 0, handlers: 0, links: 0, narrativeImages: 0 });
    });
  }

  test('sanitized narrative keeps its harmless text', async ({ page }) => {
    await dropFile(page, 'evil.json', maliciousFhir);
    await expect(page.locator('.narrative')).toContainText('Safe paragraph');
    await expect(page.locator('.narrative')).toContainText('click me');
    // Injected markup in plain fields is shown as literal text, proving it was escaped rather than parsed.
    await expect(page.getByTestId('patient-name')).toContainText('<script>');
  });
});

test.describe('unreadable files', () => {
  test.beforeEach(async ({ page }) => openApp(page));

  test('truncated JSON shows a friendly banner instead of a blank screen', async ({ page }) => {
    await dropFile(page, 'cut.json', '{"resourceType":"Bundle","entry":[{"resource":{"resourceType":"Pat');
    await expect(page.getByTestId('error-banner')).toContainText('This JSON file is damaged or incomplete');
    await expect(page.getByTestId('error-banner')).toContainText('Nothing was uploaded');
    await expect(page.getByTestId('drop-zone')).toBeVisible();
  });

  test('invalid XML shows a friendly banner', async ({ page }) => {
    await dropFile(page, 'broken.xml', '<ClinicalDocument><recordTarget></ClinicalDocument>');
    await expect(page.getByTestId('error-banner')).toContainText('This XML file is damaged or incomplete');
  });

  test('binary files are rejected with a clear message', async ({ page }) => {
    await dropFile(page, 'setup.exe', Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04]));
    await expect(page.getByTestId('error-banner')).toContainText('This looks like a Windows program');
    await dropFile(page, 'movie.mp4', Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]));
    await expect(page.getByTestId('error-banner')).toContainText('This looks like a video file');
  });

  test('a messy file renders partially with warning badges', async ({ page }) => {
    await page.getByTestId('sample-hl7').click();
    await expect(page.getByTestId('warning-pill')).toContainText('4 warnings');
    await expect(page.getByTestId('lab-row')).toHaveCount(15);
    await expect(page.getByTestId('warning').first()).toContainText('Line 13: Missing unit on OBX-6');
  });

  test('pasted text is parsed like a file', async ({ page }) => {
    await page.getByRole('button', { name: 'Paste text instead' }).click();
    await page.getByLabel('Paste FHIR JSON, HL7 v2 or C-CDA XML').fill('MSH|^~\\&|LAB|HOSP|||20250101||ORU^R01|1|P|2.5\rPID|1||9^^^^MR||Pasted^Patient\rOBX|1|NM|718-7^Hemoglobin^LN||9.1|g/dL|12-15|L');
    await page.getByRole('button', { name: 'Open pasted text' }).click();
    await expect(page.getByTestId('patient-name')).toHaveText('Patient Pasted');
    await expect(page.getByTestId('abnormal-labs')).toContainText('Hemoglobin');
  });
});
