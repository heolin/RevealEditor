import { test, expect, type Page } from '@playwright/test';

/** Text extras: r-fit-text toggle, range highlight, emoji, icon library. */

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

test('r-fit-text, highlight, emoji, and icons round-trip into the file', async ({ page }) => {
  await createDeck(page, 'e2e-textbits');
  const h1 = stageFrame(page).locator('#re-stage h1');

  // r-fit-text: inspector toggle on the selected text box.
  await h1.click();
  await page.getByRole('switch', { name: 'Fit text to width (r-fit-text)' }).check({ force: true });
  await expect(h1).toHaveClass(/r-fit-text/);

  // Highlight: select all text in a session, pick a range background.
  await h1.click();
  await expect(h1).toHaveAttribute('contenteditable', 'true');
  await page.keyboard.press('ControlOrMeta+a');
  await page.getByRole('button', { name: 'Highlight color', exact: true }).click();
  const hex = page.getByRole('textbox', { name: 'Highlight color value' });
  await hex.fill('#f5b301');
  await hex.press('Enter');
  await expect(h1.locator('span')).toHaveAttribute('style', /background-color/);

  // Emoji: popover inserts at the caret.
  await page.getByRole('button', { name: 'Emoji', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search emoji' }).fill('rocket');
  await page.getByTitle('rocket', { exact: true }).click();
  await expect(h1).toContainText('🚀');
  // End the session with a canvas click (focus sits in the parent after the
  // popover — Escape wouldn't reach the session).
  const stage = (await page.locator('iframe[title="Slide editor"]').boundingBox())!;
  await page.mouse.click(stage.x + 8, stage.y + 8);
  await page.waitForTimeout(200);

  // Icon library: inline tabler SVG, no font dependency.
  await page.getByRole('button', { name: 'Insert' }).click();
  await page.getByRole('menuitem', { name: 'Icon…' }).click();
  await page.getByRole('textbox', { name: 'Search icons' }).fill('star');
  await page.getByRole('button', { name: 'Insert star icon', exact: true }).click();
  await expect(stageFrame(page).locator('#re-stage svg.tabler-icon-star')).toBeVisible();

  await save(page);
  const file = await (await page.request.get('/files/e2e-textbits.html')).text();
  expect(file).toContain('r-fit-text');
  expect(file).toMatch(/background-color:\s*(#f5b301|rgb\(245, 179, 1\))/);
  expect(file).toContain('🚀');
  expect(file).toContain('tabler-icon-star');
  expect(file).not.toContain('contenteditable');
});
