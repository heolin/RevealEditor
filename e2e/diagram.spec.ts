import { test, expect, type Page } from '@playwright/test';

/**
 * Diagramming golden flows (docs/DIAGRAMMING.md phases 1–3): the Draw group
 * on the ribbon, two-point connector endpoints with anchor snapping, and
 * text-box design (background/padding) round-tripping into the file.
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

/** The color control is a circle button opening a popover with a hex field. */
async function pickColor(page: Page, name: string, hex: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click();
  const input = page.getByRole('textbox', { name: `${name} value` });
  await input.fill(hex);
  await input.press('Enter');
}

/** Shape buttons ARM draw mode — a canvas click then places the default
 *  size centered on that point (drag would size it instead). */
async function placeArmedShape(page: Page, fx = 0.5, fy = 0.5): Promise<void> {
  const stage = (await page.locator('iframe[title="Slide editor"]').boundingBox())!;
  await page.mouse.click(stage.x + stage.width * fx, stage.y + stage.height * fy);
  await page.waitForTimeout(150);
}

test('arrow: ribbon Draw group inserts; endpoint drags and snaps to a box anchor', async ({
  page,
}) => {
  await createDeck(page, 'e2e-arrow');

  // The Draw group lives on the ribbon (not only in the "+" menu).
  await page.getByRole('button', { name: 'Arrow', exact: true }).click();
  await placeArmedShape(page);
  const svg = stageFrame(page).locator('#re-stage svg.re-shape');
  await expect(svg).toBeVisible();
  // Inserting the first free element adds managed CSS → stage reloads and
  // selection resets. Re-select by clicking the shape.
  await page.waitForTimeout(400);
  const svgBox = (await svg.boundingBox())!;
  await page.mouse.click(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  const handles = page.locator('.endpoint-handle');
  await expect(handles).toHaveCount(2);

  // Target: the heading's bottom-left corner. Aim ~4 slide-px off — snapping
  // must pull the endpoint exactly onto the anchor. (Page px = slide px ×
  // stage scale, so the offset must be scaled too.)
  const h1 = stageFrame(page).locator('#re-stage h1');
  const hb = (await h1.boundingBox())!;
  const target = { x: hb.x, y: hb.y + hb.height };
  const styleW = parseInt((await svg.getAttribute('style'))!.match(/width: (\d+)px/)![1], 10);
  const scale = svgBox.width / styleW;

  // The p2 endpoint is the top-right one (defaults: bottom-left → top-right).
  const grip = handles.nth(1);
  const gb = (await grip.boundingBox())!;
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 4 * scale, target.y + 4 * scale, { steps: 10 });
  // Anchor dots of the hovered box appear during the drag.
  await expect(page.locator('.anchor-dot.active')).toBeVisible();
  await page.mouse.up();

  // The grip re-renders at the endpoint — snapped exactly onto the corner
  // (the unsnapped position would sit ~5.7 slide-px away).
  const after = (await grip.boundingBox())!;
  expect(Math.abs(after.x + after.width / 2 - target.x)).toBeLessThan(2.5 * scale);
  expect(Math.abs(after.y + after.height / 2 - target.y)).toBeLessThan(2.5 * scale);

  // The spec now carries the two-point geometry.
  const spec = JSON.parse((await svg.getAttribute('data-re-shape'))!);
  expect(spec.kind).toBe('arrow');
  for (const k of ['x1', 'y1', 'x2', 'y2']) expect(typeof spec[k]).toBe('number');

  await save(page);
  const file = await fileContents(page, 'e2e-arrow.html');
  expect(file).toContain('data-re-shape');
  expect(file).toMatch(/(&quot;|")x2(&quot;|")/); // spec JSON in the attr, quotes escaped
});

test('drawing a line shows a live line preview, not a selection rectangle', async ({ page }) => {
  await createDeck(page, 'e2e-linepreview');
  await page.getByRole('button', { name: 'Arrow', exact: true }).click();

  const stage = (await page.locator('iframe[title="Slide editor"]').boundingBox())!;
  const x0 = stage.x + stage.width * 0.3;
  const y0 = stage.y + stage.height * 0.35;
  const x1 = stage.x + stage.width * 0.7;
  const y1 = stage.y + stage.height * 0.65;

  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 12 });

  // Mid-drag: an actual line preview is shown (the overlay lives in the top
  // document, not the iframe), and the blue marquee rectangle is NOT.
  await expect(page.locator('.draw-line-preview svg line')).toBeVisible();
  await expect(page.locator('.marquee-box')).toHaveCount(0);

  await page.mouse.up();

  // The committed shape is a two-point connector, and the preview is gone.
  const svg = stageFrame(page).locator('#re-stage svg.re-shape');
  await expect(svg).toBeVisible();
  await expect(page.locator('.draw-line-preview')).toHaveCount(0);
  const spec = JSON.parse((await svg.getAttribute('data-re-shape'))!);
  expect(spec.kind).toBe('arrow');
});

test('snap gap: endpoint stops short of the anchor by the configured px', async ({ page }) => {
  await createDeck(page, 'e2e-snapgap');
  await page.getByRole('button', { name: 'Arrow', exact: true }).click();
  await placeArmedShape(page);
  const svg = stageFrame(page).locator('#re-stage svg.re-shape');
  await expect(svg).toBeVisible();
  await page.waitForTimeout(400);
  const svgBox = (await svg.boundingBox())!;
  await page.mouse.click(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  const handles = page.locator('.endpoint-handle');
  await expect(handles).toHaveCount(2);

  // Configure a 10px snap gap in the inspector.
  await page.getByLabel('Snap gap').fill('10');

  const h1 = stageFrame(page).locator('#re-stage h1');
  const hb = (await h1.boundingBox())!;
  const target = { x: hb.x, y: hb.y + hb.height };
  // Page px per slide px (the stage is scaled): derive from the svg box.
  const styleW = parseInt((await svg.getAttribute('style'))!.match(/width: (\d+)px/)![1], 10);
  const scale = svgBox.width / styleW;

  const grip = handles.nth(1);
  const gb = (await grip.boundingBox())!;
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 4 * scale, target.y + 4 * scale, { steps: 10 });
  await page.mouse.up();

  // Endpoint should sit ~10 slide-px from the anchor, along the line — a
  // tight window: no-snap would leave it ~5.7 slide-px away, snap-without-gap
  // at 0.
  const after = (await grip.boundingBox())!;
  const d = Math.hypot(
    after.x + after.width / 2 - target.x,
    after.y + after.height / 2 - target.y,
  );
  expect(d).toBeGreaterThan(8 * scale);
  expect(d).toBeLessThan(12 * scale);
});

test('linked arrow: endpoint attached to a box follows when the box moves', async ({ page }) => {
  await createDeck(page, 'e2e-linked');
  await page.getByRole('button', { name: 'Arrow', exact: true }).click();
  await placeArmedShape(page);
  const svg = stageFrame(page).locator('#re-stage svg.re-shape');
  await expect(svg).toBeVisible();
  await page.waitForTimeout(400);
  const svgBox = (await svg.boundingBox())!;
  await page.mouse.click(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  const handles = page.locator('.endpoint-handle');
  await expect(handles).toHaveCount(2);
  const styleW = parseInt((await svg.getAttribute('style'))!.match(/width: (\d+)px/)![1], 10);
  const scale = svgBox.width / styleW;

  // Attach p2 to the heading's bottom-left corner.
  const h1 = stageFrame(page).locator('#re-stage h1');
  const hb = (await h1.boundingBox())!;
  const corner = { x: hb.x, y: hb.y + hb.height };
  const grip = handles.nth(1);
  const gb = (await grip.boundingBox())!;
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + 4 * scale, corner.y + 4 * scale, { steps: 10 });
  await page.mouse.up();

  // Released on an anchor → linked (filled grip), ref in the spec + id on h1.
  await expect(page.locator('.endpoint-handle.attached')).toHaveCount(1);
  expect(JSON.parse((await svg.getAttribute('data-re-shape'))!).to).toMatchObject({
    anchor: 'sw',
  });
  await expect(h1).toHaveAttribute('data-re-id', /.+/);

  // Move the heading; the attached endpoint must follow its corner.
  const hc = (await h1.boundingBox())!;
  await page.mouse.move(hc.x + hc.width / 2, hc.y + hc.height / 2);
  await page.mouse.down();
  await page.mouse.move(hc.x + hc.width / 2 + 140, hc.y + hc.height / 2 + 90, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const hAfter = (await h1.boundingBox())!;
  const newCorner = { x: hAfter.x, y: hAfter.y + hAfter.height };
  const spec = JSON.parse((await svg.getAttribute('data-re-shape'))!);
  const sBox = (await svg.boundingBox())!;
  const endpoint = {
    x: sBox.x + spec.x2 * sBox.width,
    y: sBox.y + spec.y2 * sBox.height,
  };
  expect(Math.abs(endpoint.x - newCorner.x)).toBeLessThan(3);
  expect(Math.abs(endpoint.y - newCorner.y)).toBeLessThan(3);

  // The link is file-format: ref JSON + the stable id survive the save.
  await save(page);
  const file = await fileContents(page, 'e2e-linked.html');
  expect(file).toMatch(/(&quot;|")ref(&quot;|")/);
  expect(file).toContain('data-re-id');

  // Dragging the arrow ITSELF releases the link (the target stayed put).
  const sNow = (await svg.boundingBox())!;
  await page.mouse.move(sNow.x + sNow.width / 2, sNow.y + sNow.height / 2);
  await page.mouse.down();
  await page.mouse.move(sNow.x + sNow.width / 2 - 80, sNow.y + sNow.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  expect(JSON.parse((await svg.getAttribute('data-re-shape'))!).to).toBeUndefined();
});

test('shape labels: activate a rect, type, round-trips; flowchart kinds insert', async ({
  page,
}) => {
  await createDeck(page, 'e2e-label');
  // Rect inserts from the Shapes gallery (two sections: base + flowchart).
  await page.getByRole('button', { name: 'Shapes', exact: true }).click();
  await expect(page.locator('.shapes-grid')).toHaveCount(2);
  expect(await page.locator('.shapes-grid button').count()).toBeGreaterThanOrEqual(33);
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await placeArmedShape(page);
  const svg = stageFrame(page).locator('#re-stage svg.re-shape');
  await expect(svg).toBeVisible();
  await page.waitForTimeout(400);

  // Click to select, click again to activate → label session (created lazily).
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(150);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const label = svg.locator('.re-shape-label');
  await expect(label).toHaveAttribute('contenteditable', 'true');
  await page.keyboard.type('Node A');
  await page.keyboard.press('Escape');
  await expect(label).toHaveText('Node A');

  // Restyling the shape re-bakes the svg — the label must survive. Escape
  // leaves the LABEL selected; deselect and reselect the shape itself.
  const stageBox = (await page.locator('iframe[title="Slide editor"]').boundingBox())!;
  await page.mouse.click(stageBox.x + 8, stageBox.y + 8); // empty canvas: clear selection
  await page.waitForTimeout(150);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await pickColor(page, 'Fill', '#2f9e44');
  await expect(label).toHaveText('Node A');

  // Flowchart section of the gallery: insert a Predefined process.
  await page.getByRole('button', { name: 'Shapes', exact: true }).click();
  await page.getByRole('button', { name: 'Predefined process', exact: true }).click();
  await placeArmedShape(page, 0.75, 0.75);
  const shapes = stageFrame(page).locator('#re-stage svg.re-shape');
  await expect(shapes).toHaveCount(2);
  await expect(shapes.nth(1).locator('line')).toHaveCount(2); // the side bars

  await save(page);
  const file = await fileContents(page, 'e2e-label.html');
  expect(file).toContain('Node A');
  expect(file).toContain('foreignObject');
  expect(file).toContain('&quot;predefined&quot;');
  expect(file).not.toContain('contenteditable');
});

test('inspector: text section shows for a selected text box, no session needed', async ({
  page,
}) => {
  await createDeck(page, 'e2e-textpanel');
  const h1 = stageFrame(page).locator('#re-stage h1');
  await h1.click();
  // Font family lives in the right panel now (was session-only).
  await expect(page.getByRole('combobox', { name: 'Font', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Font size' }).click();
  await page.getByRole('option', { name: '24', exact: true }).click();
  await expect(h1).toHaveAttribute('style', /font-size: 24px/);
});

test('elbow route + connector label: right angles render, dblclick labels the line', async ({
  page,
}) => {
  await createDeck(page, 'e2e-elbow');
  await page.getByRole('button', { name: 'Arrow', exact: true }).click();
  await placeArmedShape(page);
  const svg = stageFrame(page).locator('#re-stage svg.re-shape');
  await expect(svg).toBeVisible();
  await page.waitForTimeout(400);
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.endpoint-handle')).toHaveCount(2);

  // Switch to elbow routing in the inspector.
  await page.getByRole('combobox', { name: 'Route' }).click();
  await page.getByRole('option', { name: 'Elbow (right angles)' }).click();
  await expect(svg.locator('polyline')).toHaveCount(1);

  // Double-click the connector → midpoint label session. Aim a bit below
  // the exact midpoint: the route's bend grip sits there and would swallow
  // the click (the middle segment is vertical, so this still hits the line).
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2 + 14);
  const label = svg.locator('.re-shape-label');
  await expect(label).toHaveAttribute('contenteditable', 'true');
  await page.keyboard.type('yes');
  await page.keyboard.press('Escape');
  await expect(label).toHaveText('yes');

  await save(page);
  const file = await fileContents(page, 'e2e-elbow.html');
  expect(file).toContain('polyline');
  expect(file).toContain('yes');
  expect(file).toMatch(/(&quot;|")route(&quot;|")/);
});

test('rotation: inspector writes rotate(), chrome rotates, resize handles hide', async ({
  page,
}) => {
  await createDeck(page, 'e2e-rotate');
  const h1 = stageFrame(page).locator('#re-stage h1');
  // Free-position the heading (rotation implies absolute).
  const hb = (await h1.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 60, hb.y + hb.height / 2 + 40, { steps: 6 });
  await page.mouse.up();

  await expect(page.locator('.rotate-handle')).toBeVisible();
  await expect(page.locator('.resize-handle')).toHaveCount(8);

  await page.getByLabel('Rotation').fill('30');
  await expect(h1).toHaveAttribute('style', /rotate\(30deg\)/);
  // Rotated: handles stay (R2 resizes in the local frame); grip stays;
  // selection box rotates.
  await expect(page.locator('.resize-handle')).toHaveCount(8);
  await expect(page.locator('.rotate-handle')).toBeVisible();
  const boxTransform = await page
    .locator('.selection-box')
    .evaluate((el) => (el as HTMLElement).style.transform);
  expect(boxTransform).toContain('rotate(30deg)');

  await save(page);
  const file = await fileContents(page, 'e2e-rotate.html');
  expect(file).toMatch(/<h1[^>]*rotate\(30deg\)/);
});

test('rotated resize works in the local frame; shapes flip via spec', async ({ page }) => {
  await createDeck(page, 'e2e-r2');
  await page.getByRole('button', { name: 'Shapes', exact: true }).click();
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await placeArmedShape(page);
  const svg = stageFrame(page).locator('#re-stage svg.re-shape');
  await expect(svg).toBeVisible();
  await page.waitForTimeout(400);
  // Deselect (canvas corner), then a single click SELECTS without opening
  // the label session a click-on-selected would.
  const stage = (await page.locator('iframe[title="Slide editor"]').boundingBox())!;
  await page.mouse.click(stage.x + 8, stage.y + 8);
  await page.waitForTimeout(150);
  const box0 = (await svg.boundingBox())!;
  await page.mouse.click(box0.x + box0.width / 2, box0.y + box0.height / 2);
  const scale = box0.width / 240; // inserted at 240×160

  await page.getByLabel('Rotation').fill('90');
  await expect(svg).toHaveAttribute('style', /rotate\(90deg\)/);
  await expect(page.locator('.resize-handle')).toHaveCount(8);

  // The 'e' handle (index 2) sits BELOW the center at 90°; dragging along
  // its rotated axis (downward) must grow the LOCAL width.
  const grip = page.locator('.resize-handle').nth(2);
  const gb = (await grip.boundingBox())!;
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2 + 40 * scale, { steps: 6 });
  await page.mouse.up();
  const width = parseInt((await svg.getAttribute('style'))!.match(/width: (\d+)px/)![1], 10);
  expect(width).toBeGreaterThan(276);
  expect(width).toBeLessThan(284);

  // Flip H writes into the spec and mirrors via a <g> wrapper.
  await page.getByRole('button', { name: 'Flip H' }).click();
  expect(await svg.innerHTML()).toContain('scale(-1, 1)');

  await save(page);
  const file = await fileContents(page, 'e2e-r2.html');
  expect(file).toMatch(/rotate\(90deg\)/);
  expect(file).toMatch(/(&quot;|")flipX(&quot;|")/);
});

test('alt-drag duplicates; new shapes inherit the last-used style', async ({ page }) => {
  await createDeck(page, 'e2e-dup');
  await page.getByRole('button', { name: 'Shapes', exact: true }).click();
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await placeArmedShape(page);
  const svgs = stageFrame(page).locator('#re-stage svg.re-shape');
  await expect(svgs).toHaveCount(1);
  await page.waitForTimeout(400);
  // Deselect first — a click on the still-selected fresh insert would open
  // the label session instead of showing the shape inspector.
  const stage = (await page.locator('iframe[title="Slide editor"]').boundingBox())!;
  await page.mouse.click(stage.x + 8, stage.y + 8);
  await page.waitForTimeout(150);
  const b = (await svgs.first().boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);

  // Restyle → the next rect of the same kind inherits it (style memory).
  await pickColor(page, 'Fill', '#2f9e44');
  await page.getByRole('button', { name: 'Shapes', exact: true }).click();
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await placeArmedShape(page, 0.72, 0.35);
  await expect(svgs).toHaveCount(2);
  expect((await svgs.nth(1).getAttribute('data-re-shape'))!).toContain('#2f9e44');

  // Alt-drag the new rect → a clone stays behind, the drag moves the original.
  const nb = (await svgs.nth(1).boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.mouse.down();
  await page.mouse.move(nb.x + nb.width / 2 + 120, nb.y + nb.height / 2 + 70, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(svgs).toHaveCount(3);

  await save(page);
  const file = await fileContents(page, 'e2e-dup.html');
  expect(file.match(/data-re-shape/g)).toHaveLength(3);
});

test('text box: background and padding from the inspector round-trip into the file', async ({
  page,
}) => {
  await createDeck(page, 'e2e-textbox');
  const h1 = stageFrame(page).locator('#re-stage h1');
  await h1.click();

  await expect(page.getByRole('button', { name: 'Background', exact: true })).toBeVisible();
  await pickColor(page, 'Background', '#ff0000');
  await page.getByLabel('Padding', { exact: true }).fill('12');

  await expect(h1).toHaveAttribute('style', /background-color/);
  await expect(h1).toHaveAttribute('style', /padding: 12px/);

  // Text boxes have all 8 handles; dragging the bottom edge writes an
  // explicit height (auto until then).
  const handles = page.locator('.resize-handle');
  await expect(handles).toHaveCount(8);
  expect((await h1.getAttribute('style')) ?? '').not.toContain('height');
  const south = handles.nth(1); // handle order: n, s, e, w, ne, nw, se, sw
  const sb = (await south.boundingBox())!;
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await expect(h1).toHaveAttribute('style', /height: \d+px/);

  await save(page);
  const file = await fileContents(page, 'e2e-textbox.html');
  expect(file).toMatch(/background-color: (#ff0000|rgb\(255, 0, 0\))/);
  expect(file).toContain('padding: 12px');
  expect(file).toMatch(/<h1[^>]*height: \d+px/);
});

test('drag-to-draw, curved route with bow grip, deck color slots', async ({ page }) => {
  await createDeck(page, 'e2e-tails');

  // Drag-to-draw: arm a rectangle, drag a region → shape at that rect.
  await page.getByRole('button', { name: 'Shapes', exact: true }).click();
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  const stage = (await page.locator('iframe[title="Slide editor"]').boundingBox())!;
  const x0 = stage.x + stage.width * 0.2;
  const y0 = stage.y + stage.height * 0.55;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + 120, y0 + 60, { steps: 6 });
  await page.mouse.up();
  const svg = stageFrame(page).locator('#re-stage svg.re-shape');
  await expect(svg).toHaveCount(1);
  const drawn = (await svg.boundingBox())!;
  expect(Math.abs(drawn.width - 120)).toBeLessThan(6);
  expect(Math.abs(drawn.height - 60)).toBeLessThan(6);

  // Curved route: an armed arrow drawn by drag, switched to Curved.
  await page.getByRole('button', { name: 'Arrow', exact: true }).click();
  await placeArmedShape(page, 0.65, 0.3);
  const arrow = stageFrame(page).locator('#re-stage svg.re-shape').nth(1);
  const ab = (await arrow.boundingBox())!;
  await page.mouse.click(stage.x + 8, stage.y + 8); // deselect
  await page.waitForTimeout(150);
  await page.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2);
  await page.getByRole('combobox', { name: 'Route' }).click();
  await page.getByRole('option', { name: 'Curved' }).click();
  expect(await arrow.innerHTML()).toContain(' Q'); // quadratic path
  // Bow it via the mid grip.
  const midGrip = page.locator('.endpoint-handle.mid');
  await expect(midGrip).toBeVisible();
  const mg = (await midGrip.boundingBox())!;
  await page.mouse.move(mg.x + mg.width / 2, mg.y + mg.height / 2);
  await page.mouse.down();
  await page.mouse.move(mg.x + mg.width / 2 + 30, mg.y + mg.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  const spec = JSON.parse((await arrow.getAttribute('data-re-shape'))!);
  expect(typeof spec.bow).toBe('number');
  expect(spec.bow).not.toBe(0.3); // moved off the default

  // Deck color slots: saving a color writes it into the managed CSS.
  // (The selected arrow's stroke control is labeled "Color".)
  await pickColor(page, 'Color', '#0ca678');
  await page.getByRole('button', { name: 'Color', exact: true }).click();
  await page.getByRole('button', { name: "Save into this deck's colors" }).click();
  await page.keyboard.press('Escape'); // close the popover

  await save(page);
  const file = await fileContents(page, 'e2e-tails.html');
  expect(file).toMatch(/(&quot;|")bow(&quot;|")/);
  expect(file).toContain('--re-colors: #0ca678');
});

test('PDF phase 2 endpoint renders or declines cleanly', async ({ page }) => {
  await createDeck(page, 'e2e-pdf2');
  const res = await page.request.post('/api/deck/pdf?path=e2e-pdf2.html', {
    timeout: 60_000,
    failOnStatusCode: false,
  });
  // With playwright + network available → a real PDF; otherwise the
  // endpoint must decline in a way the client can fall back from.
  if (res.ok()) {
    const body = await res.body();
    expect(body.subarray(0, 4).toString()).toBe('%PDF');
  } else {
    expect([500, 501]).toContain(res.status());
  }
});
