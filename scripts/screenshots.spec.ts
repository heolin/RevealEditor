import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * Captures the screenshots used by the docs site into docs/images/. Driven by
 * playwright.screenshots.config.ts against the built app + a curated
 * sample workspace (scripts/sample-workspace). Add a step here and reference
 * the PNG from the tutorial pages.
 */

const OUT = path.join(process.cwd(), 'docs', 'images');
const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT, `${name}.png`) });

const SHOWCASE = 'Aurora — Product Launch';
const stageFrame = (page: Page) => page.frameLocator('iframe[title="Slide editor"]');

async function openShowcase(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByText(SHOWCASE).click();
  await page.waitForSelector('.sorter-slide');
  await stageFrame(page).locator('#re-stage').waitFor();
  await page.waitForTimeout(700); // stage scale + theme fonts settle
}

test('capture docs screenshots', async ({ page }) => {
  // 1) Deck list (the landing screen).
  await page.goto('/');
  await page.getByText(SHOWCASE).waitFor();
  await page.waitForTimeout(500);
  await shot(page, 'deck-list');

  // 2) Editor overview — sorter + canvas + toolbar + inspector.
  await openShowcase(page);
  await shot(page, 'editor-overview');

  // 3) Insert menu open.
  await page.getByRole('button', { name: 'Insert' }).click();
  await page.waitForTimeout(300);
  await shot(page, 'insert-menu');
  await page.keyboard.press('Escape');

  // 4) A content slide with an element selected → inspector populated.
  await page.locator('.sorter-slide').nth(1).click(); // "Why now" bullets slide
  await page.waitForTimeout(400);
  await stageFrame(page).locator('#re-stage h2').first().click();
  await page.waitForTimeout(400);
  await shot(page, 'element-selected');

  expect(true).toBe(true);
});
