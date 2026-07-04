import { test, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * Captures the screenshots used by the docs site into docs/images/. Driven by
 * playwright.screenshots.config.ts against the built app + a curated sample
 * workspace (scripts/sample-workspace). Each capture is its own test so a
 * flaky flow can't block the others. Reference the PNGs from the doc pages.
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

test('deck list', async ({ page }) => {
  await page.goto('/');
  await page.getByText(SHOWCASE).waitFor();
  await page.waitForTimeout(500);
  await shot(page, 'deck-list');
});

test('editor overview', async ({ page }) => {
  await openShowcase(page);
  await shot(page, 'editor-overview');
});

test('insert menu', async ({ page }) => {
  await openShowcase(page);
  await page.getByRole('button', { name: 'Insert' }).click();
  await page.waitForTimeout(300);
  await shot(page, 'insert-menu');
});

test('shapes gallery', async ({ page }) => {
  await openShowcase(page);
  await page.getByRole('button', { name: 'Shapes', exact: true }).click();
  await page.locator('.shapes-grid').first().waitFor();
  await page.waitForTimeout(200);
  await shot(page, 'shapes-gallery');
});

test('element selected', async ({ page }) => {
  await openShowcase(page);
  await page.locator('.sorter-slide').nth(1).click(); // "Why now" bullets slide
  await page.waitForTimeout(400);
  await stageFrame(page).locator('#re-stage h2').first().click();
  await page.waitForTimeout(400);
  await shot(page, 'element-selected');
});

test('text formatting', async ({ page }) => {
  await openShowcase(page);
  await page.locator('.sorter-slide').nth(1).click(); // bullets slide
  await page.waitForTimeout(400);
  // Double-click the list to enter a text editing session → the text ribbon shows.
  await stageFrame(page).locator('#re-stage li').first().dblclick();
  await page.waitForTimeout(500);
  await shot(page, 'text-formatting');
});

test('chart modal', async ({ page }) => {
  await openShowcase(page);
  await page.getByRole('button', { name: 'Insert' }).click();
  await page.getByRole('menuitem', { name: /Chart/ }).click();
  await page.getByRole('heading', { name: 'Edit chart' }).waitFor();
  await page.waitForTimeout(500);
  await shot(page, 'chart-modal');
});

test('table editing', async ({ page }) => {
  await openShowcase(page);
  await page.locator('.sorter-slide').nth(3).click(); // "How it works" — a light slide with room
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Insert' }).click();
  await page.getByRole('menuitem', { name: 'Table' }).click();
  await page.waitForTimeout(600); // first insert adds preset CSS → stage reload
  const cell = stageFrame(page).locator('#re-stage tbody td').first();
  await cell.click();
  await page.waitForTimeout(150);
  await cell.click(); // second click opens the cell session
  await page.waitForTimeout(400);
  await shot(page, 'table-editing');
});
