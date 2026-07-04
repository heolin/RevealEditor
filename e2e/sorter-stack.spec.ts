import { test, expect, type Page } from '@playwright/test';

/**
 * Sorter drag-and-drop into vertical stacks. Regression: the default
 * rect-intersection hit testing made the in-column insertion slots
 * unreachable (column gaps always won), so slides could be dragged OUT of a
 * stack but never back IN.
 */

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

test('drag a standalone slide into a vertical stack', async ({ page }) => {
  await createDeck(page, 'e2e-stack-drop');

  // Build: column 1 = stack of 2 (via "Add below"), column 2 = standalone.
  // Slide-action buttons (hover-revealed): 0=add after, 1=add below, 2=duplicate, 3=delete
  const firstSlide = page.locator('.sorter-slide').first();
  await firstSlide.hover();
  await firstSlide.locator('.slide-actions button').nth(1).click();
  await expect(page.locator('.stack-badge')).toHaveText('2 stacked');

  const stackSlides = page.locator('.sorter-slide');
  await expect(stackSlides).toHaveCount(2);
  await stackSlides.last().hover();
  await stackSlides.last().locator('.slide-actions button').nth(0).click();
  await expect(page.locator('.sorter-slide')).toHaveCount(3);
  await expect(page.locator('.sorter-column')).toHaveCount(2);

  // Drag the standalone slide (column 2) onto the end of the stack.
  const standalone = page.locator('.sorter-slide').nth(2);
  const stackLast = page.locator('.sorter-slide').nth(1);
  const from = (await standalone.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Move past the 5px activation distance so the drag starts and slots mount.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 20, { steps: 4 });
  // Target: just below the last slide of the stack (the insertion slot).
  const to = (await stackLast.boundingBox())!;
  await page.mouse.move(to.x + to.width / 2, to.y + to.height + 2, { steps: 12 });
  await page.waitForTimeout(100);
  await page.mouse.up();

  // Expected: one column, a stack of 3.
  await expect(page.locator('.stack-badge')).toHaveText('3 stacked');
  await expect(page.locator('.sorter-column')).toHaveCount(1);
});
