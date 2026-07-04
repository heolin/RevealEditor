import { test, expect, type Page } from '@playwright/test';

/**
 * Table golden flows: merged cells (colspan/rowspan grid ops), cell colors,
 * column-width drag via colgroup, and spreadsheet clipboard paste.
 */

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

async function fileContents(page: Page, deck: string): Promise<string> {
  const res = await page.request.get(`/files/${deck}`);
  return res.text();
}

async function insertTable(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Insert' }).click();
  await page.getByRole('menuitem', { name: 'Table' }).click();
  await expect(stageFrame(page).locator('#re-stage table')).toBeVisible();
  await page.waitForTimeout(300); // first insert adds preset CSS → stage reload
}

/** Click a cell twice: select the table, then open the cell session — which
 *  also makes the cell the inspector's target. Clicks land at 30%/60% of the
 *  box: a MERGED cell's center can sit on a column-resize grip, and corner
 *  offsets fall into the collapsed-border zone the neighbor cell owns. */
async function focusCell(page: Page, row: number, col: number): Promise<void> {
  const cell = stageFrame(page).locator('#re-stage tbody tr').nth(row).locator('td').nth(col);
  // Re-measure before EACH click: empty rows are only a few px tall and the
  // first click's session teardown can shift rows under a stale coordinate.
  for (let i = 0; i < 2; i++) {
    const bb = (await cell.boundingBox())!;
    await page.mouse.click(bb.x + bb.width * 0.3, bb.y + bb.height * 0.6);
    await page.waitForTimeout(200);
  }
}

test('merge right/down, split, and cell colors round-trip', async ({ page }) => {
  await createDeck(page, 'e2e-tmerge');
  await insertTable(page);
  await focusCell(page, 0, 0);

  await page.getByRole('button', { name: 'Merge →', exact: true }).click();
  const table = stageFrame(page).locator('#re-stage table');
  await expect(table.locator('tbody tr').first().locator('td')).toHaveCount(2);
  await expect(table.locator('td[colspan="2"]')).toHaveCount(1);
  // A 2-wide cell can only merge down into an equally wide neighbor — the
  // guard keeps the grid rectangular.
  await expect(page.getByRole('button', { name: 'Merge ↓', exact: true })).toBeDisabled();

  // Widen the row below the same way, then the downward merge aligns.
  await focusCell(page, 1, 0);
  await page.getByRole('button', { name: 'Merge →', exact: true }).click();
  await focusCell(page, 0, 0);
  await page.getByRole('button', { name: 'Merge ↓', exact: true }).click();
  await expect(table.locator('td[rowspan="2"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(table.locator('td[colspan], td[rowspan]')).toHaveCount(0);
  await expect(table.locator('tbody tr').first().locator('td')).toHaveCount(3);

  // Cell colors write inline styles on the cell only.
  await page.getByRole('button', { name: 'Cell fill', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Cell fill value' });
  await input.fill('#f5b301');
  await input.press('Enter');
  const styled = table.locator('tbody tr').first().locator('td').first();
  await expect(styled).toHaveAttribute('style', /background-color/);

  await save(page);
  const file = await fileContents(page, 'e2e-tmerge.html');
  expect(file).toContain('background-color');
  expect(file).not.toContain('contenteditable');
});

test('column drag writes colgroup %; spreadsheet paste fills and creates tables', async ({
  page,
}) => {
  await createDeck(page, 'e2e-tpaste');
  await insertTable(page);
  const table = stageFrame(page).locator('#re-stage table');

  // Select the table → boundary grips appear (3 columns → 2 grips).
  await table.click();
  await page.waitForTimeout(150);
  const grips = page.locator('.col-resize-grip');
  await expect(grips).toHaveCount(2);
  const g = (await grips.first().boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 + 50, g.y + g.height / 2, { steps: 6 });
  await page.mouse.up();
  const colWidth = await table
    .locator('colgroup col')
    .first()
    .evaluate((c) => (c as HTMLElement).style.width);
  expect(parseFloat(colWidth)).toBeGreaterThan(34); // grew past the even third

  // TSV paste into a cell session distributes across the grid.
  await focusCell(page, 0, 0);
  await stageFrame(page)
    .locator('#re-stage tbody tr')
    .first()
    .locator('td')
    .first()
    .evaluate((cell) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'a\tb\nc\td');
      cell.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertFromPaste',
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  await expect(table.locator('tbody tr').nth(0).locator('td').nth(1)).toHaveText('b');
  await expect(table.locator('tbody tr').nth(1).locator('td').nth(0)).toHaveText('c');

  // Stage-level paste (no session): clipboard TSV becomes a NEW table.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await stageFrame(page)
    .locator('#re-stage')
    .evaluate((stage) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'X\tY\n1\t2');
      stage.ownerDocument.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    });
  await expect(stageFrame(page).locator('#re-stage table')).toHaveCount(2);
  await expect(stageFrame(page).locator('#re-stage table').nth(1).locator('th').first()).toHaveText(
    'X',
  );

  await save(page);
  const file = await fileContents(page, 'e2e-tpaste.html');
  expect(file).toContain('<colgroup>');
  expect(file).toMatch(/width: [\d.]+%/);
});
