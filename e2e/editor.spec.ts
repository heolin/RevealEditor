import { test, expect, type Page, type Frame } from '@playwright/test';

/**
 * Golden-flow E2E: these drive the real editor in a real browser against a
 * disposable workspace. Every flow here has broken at least once while unit
 * tests stayed green (iframe pointer events, cross-realm instanceof, reveal
 * scroll view) — that is why this suite exists.
 */

const stageFrame = (page: Page) =>
  page.frameLocator('iframe[title="Slide editor"]');

function previewFrame(page: Page): Frame {
  const f = page.frames().find((fr) => fr.url().includes('preview.html'));
  if (!f) throw new Error('preview harness frame not found');
  return f;
}

async function openDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByText('RevealEditor demo deck').click();
  await page.waitForSelector('.sorter-slide');
  await page.waitForTimeout(1200); // initial preview sync
}

/** Create a fresh single-slide deck so edits don't interfere across tests. */
async function createDeck(page: Page, name: string): Promise<void> {
  // Idempotent across retries: drop any leftover from a previous attempt.
  await page.request.delete(`/api/deck?path=${name}.html`).catch(() => undefined);
  await page.goto('/');
  await page.getByRole('button', { name: 'New presentation' }).click();
  await page.getByLabel('Title').fill(name);
  await page.getByLabel('File name (optional)').fill(`${name}.html`);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForSelector('.sorter-slide');
  // The Insert button appears once the stage iframe is wired.
  await expect(page.getByRole('button', { name: 'Insert' })).toBeVisible();
}

async function openInsertMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Insert' }).click();
}

async function save(page: Page): Promise<void> {
  const saveBtn = page.getByRole('button', { name: 'Save', exact: true });
  await saveBtn.click();
  await expect(saveBtn).toBeDisabled(); // disabled = clean
}

async function fileContents(page: Page, deck: string): Promise<string> {
  const res = await page.request.get(`/files/${deck}`);
  return res.text();
}

test('preview navigates stacks exactly (no scroll-view, no drift)', async ({ page }) => {
  await openDemo(page);
  const thumbs = page.locator('.sorter-slide');
  const count = await thumbs.count();
  expect(count).toBeGreaterThanOrEqual(5);

  // Structure: harness must keep vertical stacks nested.
  const structure = await previewFrame(page).evaluate(() =>
    [...document.querySelectorAll('.slides > section')].map(
      (s) => s.querySelectorAll(':scope > section').length,
    ),
  );
  expect(structure.some((kids) => kids >= 2)).toBe(true);

  // Click the last two thumbs (the stack) — indices must match exactly.
  const expected: [number, number][] = [];
  {
    // derive expectation from the harness structure
    let h = 0;
    for (const kids of structure) {
      for (let v = 0; v < Math.max(1, kids); v++) expected.push([h, v]);
      h++;
    }
  }
  for (const i of [count - 2, count - 1, count - 2]) {
    await thumbs.nth(i).click();
    await page.waitForTimeout(400);
    const idx = await previewFrame(page).evaluate(() =>
      (window as unknown as { __debug: { deck: { getIndices(): { h: number; v: number } } } })
        .__debug.deck.getIndices(),
    );
    expect([idx.h, idx.v]).toEqual(expected[i]);
  }
});

test('text edit round-trips into the file', async ({ page }) => {
  await createDeck(page, 'e2e-text');
  const heading = stageFrame(page).locator('#re-stage h1');
  await heading.click();
  await heading.click(); // click-again enters editing
  await page.waitForTimeout(200);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Edited headline');
  await page.keyboard.press('Escape');
  await save(page);
  const file = await fileContents(page, 'e2e-text.html');
  expect(file).toContain('Edited headline');
  expect(file).not.toContain('contenteditable');
});

test('drag converts to absolute positioning and snaps into the file', async ({ page }) => {
  await createDeck(page, 'e2e-drag');
  const heading = stageFrame(page).locator('#re-stage h1');
  const box = (await heading.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 80, { steps: 8 });
  await page.mouse.up();
  await save(page);
  const file = await fileContents(page, 'e2e-drag.html');
  expect(file).toMatch(/<h1[^>]*position: absolute/);
  expect(file).toMatch(/<section[^>]*height: 700px/); // section pinned
});

test('table: insert, edit cells with Tab, add row via context menu', async ({ page }) => {
  await createDeck(page, 'e2e-table');
  // Insert table from the "+" menu (first ribbon control).
  await openInsertMenu(page);
  await page.getByRole('menuitem', { name: 'Table' }).click();
  const table = stageFrame(page).locator('#re-stage table');
  await expect(table).toBeVisible();

  // First table insert adds preset CSS → stage srcdoc reloads → selection
  // resets. Click selects, click again activates (the standard flow).
  const firstCell = table.locator('tbody td').first();
  await firstCell.click();
  await page.waitForTimeout(150);
  await firstCell.click();
  await page.waitForTimeout(200);
  await page.keyboard.type('alpha');
  await page.keyboard.press('Tab');
  await page.keyboard.type('beta');
  await page.keyboard.press('Escape');

  // Right-click the first body cell → Add row below.
  await firstCell.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add row below' }).click();
  await expect(table.locator('tbody tr')).toHaveCount(4);

  await save(page);
  const file = await fileContents(page, 'e2e-table.html');
  expect(file).toContain('alpha');
  expect(file).toContain('beta');
  expect((file.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(5); // header + 4 body
});

test('code block: insert, edit in modal, styled on canvas, clean in file', async ({ page }) => {
  await createDeck(page, 'e2e-code');
  await openInsertMenu(page);
  await page.getByRole('menuitem', { name: 'Code block' }).click();
  // Insert opens the code modal automatically.
  await expect(page.getByRole('heading', { name: 'Edit code' })).toBeVisible();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('print("e2e was here")');
  await page.getByRole('button', { name: 'Save code' }).click();

  // Canvas shows highlight background (hljs class applied for display).
  const codeBg = await stageFrame(page)
    .locator('#re-stage pre code')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(codeBg).not.toBe('rgba(0, 0, 0, 0)');

  await save(page);
  const file = await fileContents(page, 'e2e-code.html');
  expect(file).toContain('print("e2e was here")');
  expect(file).not.toContain('hljs'); // display-only class never saved
});

test('multi-select: shift-click, align, group, ungroup round-trip', async ({ page }) => {
  await createDeck(page, 'e2e-multi');
  // Two elements: the template h1 plus an inserted paragraph.
  await openInsertMenu(page);
  await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
  const stage = stageFrame(page);
  const h1 = stage.locator('#re-stage h1');
  const p = stage.locator('#re-stage p');
  await expect(p).toBeVisible();

  await h1.click();
  await p.click({ modifiers: ['Shift'] });
  // Two selection boxes visible (primary + secondary).
  await expect(page.locator('.selection-box')).toHaveCount(2);

  // Align left edges via the ribbon.
  await page.getByRole('button', { name: 'Align left edges' }).click();
  const left = async (loc: typeof h1) => loc.evaluate((el) => el.style.left);
  expect(await left(h1)).toBe(await left(p));

  // Group them.
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  await expect(stage.locator('#re-stage .re-group')).toHaveCount(1);
  await save(page);
  let file = await fileContents(page, 'e2e-multi.html');
  expect(file).toContain('re-group');

  // Ungroup restores flat structure with slide coordinates. Click empty
  // canvas first — clicking a selected group drills into its children.
  await stage.locator('#re-stage').click({ position: { x: 5, y: 5 } });
  await stage.locator('#re-stage .re-group').click();
  await page.keyboard.press('ControlOrMeta+Shift+g');
  await expect(stage.locator('#re-stage .re-group')).toHaveCount(0);
  await save(page);
  file = await fileContents(page, 'e2e-multi.html');
  expect(file).not.toContain('re-group');
  expect(file).toMatch(/<h1[^>]*position: absolute/);
});

test('layers panel: tree select, hover, sibling reorder round-trips', async ({ page }) => {
  await createDeck(page, 'e2e-layers');
  await openInsertMenu(page);
  await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
  await page.getByRole('tab', { name: 'Layers' }).click();

  const rows = page.locator('.layer-row');
  await expect(rows).toHaveCount(2); // h1 + inserted p

  // Clicking a row selects the element on canvas.
  await rows.first().click();
  await expect(page.locator('.selection-box')).toHaveCount(1);
  await expect(rows.first()).toHaveClass(/selected/);

  // Shift-click builds a multi-selection.
  await rows.nth(1).click({ modifiers: ['Shift'] });
  await expect(page.locator('.selection-box')).toHaveCount(2);

  // Reorder: move the h1 after the p, save, verify DOM order in the file.
  await rows.first().hover();
  await rows.first().getByTitle('Move later (down in order)').click();
  await save(page);
  const file = await fileContents(page, 'e2e-layers.html');
  expect(file.indexOf('<p')).toBeLessThan(file.indexOf('<h1'));
});

test('layout mode: columns, drag into flow, free out, back into layout', async ({ page }) => {
  await createDeck(page, 'e2e-layout');
  const stage = stageFrame(page);

  // Insert a two-column container and enable layout mode.
  await openInsertMenu(page);
  await page.getByRole('menuitem', { name: 'Two columns' }).click();
  await expect(stage.locator('#re-stage .re-cols .re-col')).toHaveCount(2);
  await page.getByRole('button', { name: 'Layout mode' }).click();

  // Drag the template h1 into the first (empty) column.
  const h1 = stage.locator('#re-stage h1');
  const col1 = stage.locator('#re-stage .re-col').first();
  const from = (await h1.boundingBox())!;
  const to = (await col1.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(stage.locator('#re-stage .re-col:first-child h1')).toHaveCount(1);
  await save(page);
  let file = await fileContents(page, 'e2e-layout.html');
  expect(file).toMatch(/re-col[^]*?<h1/); // h1 nested inside the column
  expect(file).not.toMatch(/<h1[^>]*position: absolute/);

  // Leave layout mode; drag the h1 free (absolute), then re-enter layout
  // mode and drop it back into the second column.
  await page.getByRole('button', { name: 'Layout mode' }).click();
  const inCol = (await stage.locator('#re-stage h1').boundingBox())!;
  await page.mouse.move(inCol.x + 20, inCol.y + 10);
  await page.mouse.down();
  await page.mouse.move(inCol.x + 220, inCol.y + 200, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => stage.locator('#re-stage h1').evaluate((el) => el.style.position))
    .toBe('absolute');

  await page.getByRole('button', { name: 'Layout mode' }).click();
  const freePos = (await stage.locator('#re-stage h1').boundingBox())!;
  const col2 = (await stage.locator('#re-stage .re-col').nth(1).boundingBox())!;
  await page.mouse.move(freePos.x + 20, freePos.y + 10);
  await page.mouse.down();
  // Drop at the column's vertical center — empty columns are only ~28
  // slide-px tall (min-height), so a fixed offset can overshoot.
  await page.mouse.move(col2.x + col2.width / 2, col2.y + col2.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(stage.locator('#re-stage .re-col:nth-child(2) h1')).toHaveCount(1);
  await expect
    .poll(async () => stage.locator('#re-stage h1').evaluate((el) => el.style.position))
    .toBe('');
  await save(page);
  file = await fileContents(page, 'e2e-layout.html');
  expect(file).not.toMatch(/<h1[^>]*position: absolute/);
});

test('insert menu closes after selection; undo never blanks the deck', async ({ page }) => {
  await openDemo(page);
  await openInsertMenu(page);
  await page.getByRole('menuitem', { name: 'Heading', exact: true }).click();
  await expect(page.locator('.mantine-Menu-dropdown')).toHaveCount(0);

  // Undo floor: mash undo well past history — slides must survive.
  for (let i = 0; i < 8; i++) await page.keyboard.press('ControlOrMeta+z');
  const thumbs = await page.locator('.sorter-slide').count();
  expect(thumbs).toBeGreaterThanOrEqual(5);
});
