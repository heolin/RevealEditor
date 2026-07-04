import { test, expect, type Page } from '@playwright/test';

/**
 * Workspace flows: slide-number config splice, cross-deck slide copy/paste
 * via the system clipboard, jump-to-slide search, and the "file changed on
 * disk" banner.
 */

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const stageFrame = (page: Page) => page.frameLocator('iframe[title="Slide editor"]');

async function createDeck(page: Page, name: string): Promise<void> {
  await page.request.delete(`/api/deck?path=${name}.html`).catch(() => undefined);
  await page.goto('/');
  await page.getByRole('button', { name: 'New presentation' }).click();
  await page.getByLabel('Title').fill(name);
  await page.getByLabel('File name (optional)').fill(`${name}.html`);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForSelector('.sorter-slide');
  await expect(page.getByRole('button', { name: 'Insert' })).toBeVisible();
}

async function save(page: Page): Promise<void> {
  const saveBtn = page.getByRole('button', { name: 'Save', exact: true });
  await saveBtn.click();
  await expect(saveBtn).toBeDisabled();
}

test('slide numbers toggle; copy/paste slide via clipboard; search jumps', async ({ page }) => {
  await createDeck(page, 'e2e-ws');

  // Slide numbers splice into Reveal.initialize on save.
  await page.getByRole('switch', { name: 'Slide numbers' }).check({ force: true });
  await save(page);
  const file = await (await page.request.get('/files/e2e-ws.html')).text();
  expect(file).toContain('slideNumber: true');

  // Copy the slide to the system clipboard, paste it back as a new slide.
  const slide = page.locator('.sorter-slide').first();
  await slide.hover();
  // slide-actions order: add-after, add-below, copy-to-clipboard, duplicate, delete
  await slide.locator('.slide-actions button').nth(2).click();
  await page.getByTitle('Paste slide from clipboard (works across decks)').click();
  await expect(page.locator('.sorter-slide')).toHaveCount(2);

  // Search highlights matches; Enter cycles the selection through them.
  await page.getByLabel('Find slide').fill('e2e-ws');
  await expect(page.locator('.sorter-slide.search-hit')).toHaveCount(2);
  const selectedIndex = () =>
    page
      .locator('.sorter-slide')
      .evaluateAll((els) => els.findIndex((e) => e.classList.contains('selected')));
  await page.getByLabel('Find slide').press('Enter');
  const first = await selectedIndex();
  await page.getByLabel('Find slide').press('Enter');
  expect(await selectedIndex()).not.toBe(first);
});

test('external edits raise the file-changed banner; reload picks them up', async ({ page }) => {
  await createDeck(page, 'e2e-ext');

  // Simulate an outside edit: overwrite the slides through the API directly.
  await page.request.put('/api/deck?path=e2e-ext.html', {
    data: {
      slidesHtml: '\n      <section><h1>External edit</h1></section>\n',
      force: true,
    },
  });

  const banner = page.getByText('This file changed on disk outside the editor.');
  await expect(banner).toBeVisible({ timeout: 12_000 }); // 5s poll cadence
  await page.getByRole('button', { name: 'Reload from disk' }).click();
  await expect(banner).toHaveCount(0);
  await expect(stageFrame(page).locator('#re-stage h1')).toHaveText('External edit');
});
