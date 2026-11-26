import { expect, test, type Page } from '@playwright/test';
import { dropSample, openApp } from './helpers';

async function chooseLanguage(page: Page, code: 'en' | 'fa' | 'tr'): Promise<void> {
  await page.getByTestId('language-menu').selectOption(code);
  await expect(page.locator('html')).toHaveAttribute('lang', code);
}

/** Unicode directional isolates that keep a value left to right inside right-to-left text. */
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const TABS = ['summary', 'report', 'map', 'dev'] as const;

test.describe('Persian (right to left)', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, 'summary');
    await chooseLanguage(page, 'fa');
  });

  test('the whole layout mirrors and nothing overflows', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('هر فایل بیمارستانی را باز کنید');
    await dropSample(page, 'fhir');

    // The patient sidebar moves to the right edge and the content sits to its left.
    const sidebar = await page.getByTestId('patient-card').boundingBox();
    const content = await page.getByTestId('summary-view').boundingBox();
    expect(sidebar!.x).toBeGreaterThan(content!.x + content!.width - 5);

    for (const tab of TABS) {
      await page.locator(`#tab-${tab}`).click();
      const overflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth - window.innerWidth,
        vertical: document.documentElement.scrollHeight - window.innerHeight,
      }));
      expect(overflow, tab).toEqual({ horizontal: 0, vertical: 0 });
    }
  });

  test('the summary is in Persian while values stay readable left to right', async ({ page }) => {
    await dropSample(page, 'fhir');
    await expect(page.getByTestId('summary-overall')).toContainText('رسیدگی فوری پزشکی');
    const sugar = page.locator('[data-topic="blood-sugar"]');
    await expect(sugar).toContainText('قند خون شما بالاست');
    await expect(sugar).toContainText('بعد از غذا ۱۰ تا ۱۵ دقیقه پیاده‌روی کنید');
    // Numbers and ranges are isolated, so "۴ – ۵٫۶" can never be displayed reversed.
    const html = await sugar.innerHTML();
    expect(html).toContain(`${LRI}۸٫۴ %${PDI}`);
    expect(html).toContain(`${LRI}۴ – ۵٫۶${PDI}`);
    // Dates are Jalali, digits Persian; codes and identifiers stay as written.
    await expect(page.getByTestId('patient-card')).toContainText('۲۳ مرداد ۱۳۴۷');
    await expect(page.getByTestId('patient-card')).toContainText('۵۸ ساله');
    await expect(page.getByTestId('patient-card')).toContainText('MRN-48213907');
    await expect(sugar).toContainText('۲۲ اسفند ۱۴۰۳');
    await expect(page.getByTestId('summary-medicines')).toContainText('معمولاً به پایین آوردن قند خون کمک می‌کند');
  });

  test('code, raw payloads and the diagram stay left to right', async ({ page }) => {
    await dropSample(page, 'fhir');
    await page.locator('#tab-dev').click();
    await expect(page.getByTestId('code-block').last()).toHaveAttribute('dir', 'ltr');
    await expect(page.getByTestId('code-block').last()).toHaveCSS('direction', 'ltr');
    await page.locator('#tab-map').click();
    await expect(page.getByTestId('graph-node').first()).toBeVisible();
    expect(await page.getByTestId('graph-node').first().evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    await expect(page.getByTestId('kind-medication')).toContainText('داروها');
  });

  test('arrow keys follow the mirrored tab order', async ({ page }) => {
    await dropSample(page, 'fhir');
    await page.locator('#tab-summary').focus();
    // In a right-to-left layout the next tab is visually to the left.
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#tab-report')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-summary')).toHaveAttribute('aria-selected', 'true');
  });

  test('modals, errors and the print document are translated', async ({ page }) => {
    await page.getByTestId('file-input').setInputFiles({ name: 'cut.json', mimeType: 'application/json', buffer: Buffer.from('{"resourceType":"Bundle","entry":[') });
    await expect(page.getByTestId('error-banner')).toContainText('این فایل JSON خراب یا ناقص است');
    await dropSample(page, 'ccda');
    await page.getByTestId('open-scrubber').click();
    await expect(page.getByRole('dialog')).toContainText('پنهان کردن اطلاعات خصوصی');
    await page.keyboard.press('Escape');
    await page.getByTestId('open-print').click();
    await expect(page.getByTestId('print-preview')).toContainText('خلاصه بالینی');
    await expect(page.getByTestId('print-document').first()).toHaveAttribute('dir', 'rtl');
    await page.keyboard.press('Escape');
    await page.getByTestId('trust-pill').click();
    await expect(page.getByTestId('privacy-modal')).toContainText('فایل‌های شما هرگز از دستگاهتان خارج نمی‌شوند');
  });

  test('the choice survives a reload and can be switched back', async ({ page }) => {
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await chooseLanguage(page, 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Open & understand any hospital file');
  });
});

test.describe('Turkish', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, 'summary');
    await chooseLanguage(page, 'tr');
  });

  test('interface and health guidance are in Turkish, left to right', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await dropSample(page, 'hl7');
    await expect(page.getByRole('tab', { name: 'Özetim' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-topic="kidneys"]')).toContainText('Böbrekleriniz normalin altında çalışıyor');
    await expect(page.locator('[data-topic="kidneys"]')).toContainText('ibuprofen veya naproksen gibi iltihap giderici ağrı kesicileri kullanmayın');
    await page.getByRole('tab', { name: 'Sade Rapor' }).click();
    await expect(page.getByTestId('simple-report')).toContainText('Tam Kan Sayımı (Hemogram)');
    await expect(page.getByTestId('lab-row').first()).toContainText(/Yüksek|Düşük|Kritik/);
    await expect(page.getByTestId('patient-card')).toContainText('23 Şub 1959');
    await expect(page.getByTestId('warning-pill')).toContainText('4 uyarı');
  });
});

test('the browser language picks the interface language on a first visit', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'tr-TR' });
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(page.getByTestId('drop-zone')).toContainText('Tıbbi dosyayı buraya bırakın');
  await context.close();
});

test('switching language makes no network request', async ({ page, context }) => {
  await openApp(page);
  const requests: string[] = [];
  context.on('request', (request) => {
    if (!/^(blob|data):/.test(request.url())) requests.push(request.url());
  });
  for (const code of ['fa', 'tr', 'en', 'fa'] as const) {
    await chooseLanguage(page, code);
    await page.getByTestId('sample-fhir').click();
    await expect(page.getByTestId('workspace')).toBeVisible();
    await page.getByTestId('clear-file').click();
  }
  await page.waitForTimeout(300);
  expect(requests).toEqual([]);
});
