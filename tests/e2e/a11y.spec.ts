import { expect, test, type Page } from '@playwright/test';
import { dropSample, openApp } from './helpers';

/** Foreground / background token pairs that carry text in the UI. */
const TEXT_PAIRS: Array<[foreground: string, background: string]> = [
  ['--mv-text', '--mv-surface'],
  ['--mv-text', '--mv-canvas'],
  ['--mv-muted', '--mv-surface'],
  ['--mv-muted', '--mv-canvas'],
  ['--mv-accent-strong', '--mv-surface'],
  ['--mv-accent-strong', '--mv-accent-tint'],
  ['--mv-on-accent', '--mv-accent-strong'],
  ['--mv-crit-text', '--mv-crit-bg'],
  ['--mv-crit-text', '--mv-surface'],
  ['--mv-warn-text', '--mv-warn-bg'],
  ['--mv-ok-text', '--mv-ok-bg'],
];

/** WCAG 2.x contrast ratios of the palette tokens, computed from the live stylesheet. */
async function contrastRatios(page: Page, pairs: typeof TEXT_PAIRS) {
  return page.evaluate((tokenPairs) => {
    const style = getComputedStyle(document.documentElement);
    // The canvas normalizes any CSS colour syntax (#fff, rgb(), named) to #rrggbb.
    const context = document.createElement('canvas').getContext('2d')!;
    const toHex = (color: string) => {
      context.fillStyle = color;
      return context.fillStyle;
    };
    const luminance = (color: string) => {
      const hex = toHex(color);
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    return tokenPairs.map(([foreground, background]) => {
      const [a, b] = [foreground, background].map((token) => luminance(style.getPropertyValue(token).trim()));
      return { pair: `${foreground} on ${background}`, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
  }, pairs);
}

test.beforeEach(async ({ page }) => openApp(page));

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} palette meets WCAG AA contrast for all text, including alerts`, async ({ page }) => {
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const { pair, ratio } of await contrastRatios(page, TEXT_PAIRS)) {
      expect(ratio, `${pair} in ${theme} mode`).toBeGreaterThanOrEqual(4.5);
    }
  });
}

test('theme choice persists across reloads', async ({ page }) => {
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('tabs and modals are fully keyboard operable', async ({ page }) => {
  await dropSample(page, 'fhir');

  const report = page.getByRole('tab', { name: 'Simple Report' });
  await report.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Visual Map' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Visual Map' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('dev-view')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('simple-report')).toBeVisible();

  // A modal traps focus and Escape closes it, returning to the page.
  await page.getByTestId('open-scrubber').focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Hide private info' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    // Focus may rest on the document itself between cycles, but never on a control behind the modal.
    expect(await page.evaluate(() => document.activeElement === document.body || Boolean(document.activeElement?.closest('dialog')))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Body map zones are reachable and operable from the keyboard.
  await page.locator('[data-zone="cardio"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('filter-banner')).toContainText('Heart / Cardio');
});

test('landmarks and labels are exposed to assistive technology', async ({ page }) => {
  await dropSample(page, 'ccda');
  await expect(page.getByRole('tablist', { name: 'Workspace views' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Patient summary' })).toBeVisible();
  await expect(page.getByRole('note', { name: 'Allergies' })).toContainText('Penicillin');
  await expect(page.getByRole('navigation', { name: 'Report sections' })).toBeVisible();
  await expect(page.locator('[data-zone="cardio"]')).toHaveAttribute('aria-label', /Heart \/ Cardio: \d+ records, abnormal results/);
  const unnamedButtons = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !(b.textContent?.trim() || b.getAttribute('aria-label') || b.title)).length);
  expect(unnamedButtons).toBe(0);
});

for (const [name, width, height] of [
  ['1280px clinic desktop', 1280, 800],
  ['768px tablet', 768, 1024],
] as const) {
  test(`layout is usable on a ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await dropSample(page, 'fhir');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('abnormal-labs')).toBeVisible();
    await expect(page.getByTestId('clear-file')).toBeVisible();

    if (width < 1024) {
      // The sidebar collapses behind a toggle, keeping allergies one tap away.
      await expect(page.getByTestId('patient-card')).toBeHidden();
      await page.getByRole('button', { name: 'Toggle patient sidebar' }).click();
      await expect(page.getByTestId('allergies')).toBeVisible();
    } else {
      await expect(page.getByTestId('allergies')).toBeVisible();
    }
  });
}
