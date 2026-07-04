import { describe, it, expect, beforeEach } from 'vitest';
import type { StageCtx } from './commands';
import {
  addColumn,
  addRow,
  allCells,
  canMerge,
  canSplit,
  deleteColumn,
  deleteRow,
  hasHeaderRow,
  mergeCells,
  nextCell,
  parseClipboardTable,
  parseTsv,
  pasteFillCells,
  setColumnAlignment,
  splitCell,
  tableGrid,
  toggleHeaderRow,
} from './table';

function makeCtx(html: string): { ctx: StageCtx; table: HTMLTableElement } {
  const section = document.createElement('section');
  section.innerHTML = html;
  const ctx: StageCtx = {
    doc: document,
    section,
    slideId: 'test',
    markClean: () => undefined,
  };
  return { ctx, table: section.querySelector('table')! };
}

const BASIC =
  '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
  '<tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table>';

describe('table operations', () => {
  let ctx: StageCtx;
  let table: HTMLTableElement;

  beforeEach(() => {
    ({ ctx, table } = makeCtx(BASIC));
  });

  it('addRow below inserts a td row of matching width', () => {
    const cell = table.tBodies[0].rows[0].cells[0];
    addRow(ctx, cell, 'below');
    expect(table.tBodies[0].rows).toHaveLength(3);
    expect(table.tBodies[0].rows[1].cells).toHaveLength(2);
    expect(table.tBodies[0].rows[1].cells[0].tagName).toBe('TD');
  });

  it('addRow relative to a header row lands at the top of tbody', () => {
    const headerCell = table.tHead!.rows[0].cells[0];
    addRow(ctx, headerCell, 'below');
    expect(table.tHead!.rows).toHaveLength(1);
    expect(table.tBodies[0].rows[0].cells[0].textContent).toBe('');
  });

  it('addColumn right inserts th in thead and td in tbody', () => {
    const cell = table.tBodies[0].rows[0].cells[0];
    addColumn(ctx, cell, 'right');
    expect(table.tHead!.rows[0].cells).toHaveLength(3);
    expect(table.tHead!.rows[0].cells[1].tagName).toBe('TH');
    expect(table.tBodies[0].rows[0].cells[1].tagName).toBe('TD');
    expect(table.tBodies[0].rows[0].cells.length).toBe(3);
  });

  it('deleteRow removes the row; the last row is protected', () => {
    deleteRow(ctx, table.tBodies[0].rows[1].cells[0]);
    expect(table.tBodies[0].rows).toHaveLength(1);
    deleteRow(ctx, table.tBodies[0].rows[0].cells[0]);
    deleteRow(ctx, table.tHead!.rows[0].cells[0]);
    expect(table.rows.length).toBe(1);
  });

  it('deleteColumn removes the column everywhere; last column protected', () => {
    deleteColumn(ctx, table.tBodies[0].rows[0].cells[1]);
    expect(table.tHead!.rows[0].cells).toHaveLength(1);
    expect(table.tBodies[0].rows[0].cells).toHaveLength(1);
    deleteColumn(ctx, table.tBodies[0].rows[0].cells[0]);
    expect(table.tBodies[0].rows[0].cells).toHaveLength(1);
  });

  it('toggleHeaderRow converts th↔td and moves rows between thead/tbody', () => {
    expect(hasHeaderRow(table)).toBe(true);
    toggleHeaderRow(ctx, table);
    expect(hasHeaderRow(table)).toBe(false);
    expect(table.tBodies[0].rows).toHaveLength(3);
    expect(table.tBodies[0].rows[0].cells[0].tagName).toBe('TD');
    expect(table.tBodies[0].rows[0].cells[0].textContent).toBe('A');
    toggleHeaderRow(ctx, table);
    expect(hasHeaderRow(table)).toBe(true);
    expect(table.tHead!.rows[0].cells[0].tagName).toBe('TH');
    expect(table.tBodies[0].rows).toHaveLength(2);
  });

  it('setColumnAlignment styles every cell in the column and clears cleanly', () => {
    const cell = table.tBodies[0].rows[0].cells[1];
    setColumnAlignment(ctx, cell, 'right');
    expect(table.tHead!.rows[0].cells[1].style.textAlign).toBe('right');
    expect(table.tBodies[0].rows[1].cells[1].style.textAlign).toBe('right');
    setColumnAlignment(ctx, cell, null);
    expect(table.tBodies[0].rows[1].cells[1].hasAttribute('style')).toBe(false);
  });

  it('nextCell walks reading order across thead/tbody and stops at the ends', () => {
    const cells = allCells(table);
    expect(cells.map((c) => c.textContent)).toEqual(['A', 'B', '1', '2', '3', '4']);
    expect(nextCell(cells[1], 1)?.textContent).toBe('1');
    expect(nextCell(cells[0], -1)).toBeNull();
    expect(nextCell(cells[5], 1)).toBeNull();
  });
});

const GRID_3X3 =
  '<table><tbody>' +
  '<tr><td>a</td><td>b</td><td>c</td></tr>' +
  '<tr><td>d</td><td>e</td><td>f</td></tr>' +
  '<tr><td>g</td><td>h</td><td>i</td></tr>' +
  '</tbody></table>';

describe('merge / split (grid-consistent)', () => {
  it('mergeCells right absorbs the neighbor, keeps both contents', () => {
    const { ctx, table } = makeCtx(GRID_3X3);
    const a = table.rows[0].cells[0];
    mergeCells(ctx, a, 'right');
    expect(a.getAttribute('colspan')).toBe('2');
    expect(a.textContent).toBe('a b');
    expect(table.rows[0].cells).toHaveLength(2);
    // The logical grid stays rectangular.
    const grid = tableGrid(table);
    expect(grid.every((r) => r.length === 3 && r.every(Boolean))).toBe(true);
  });

  it('mergeCells down spans rows; misaligned merges are refused', () => {
    const { ctx, table } = makeCtx(GRID_3X3);
    const a = table.rows[0].cells[0];
    mergeCells(ctx, a, 'down');
    expect(a.getAttribute('rowspan')).toBe('2');
    expect(table.rows[1].cells).toHaveLength(2);
    // 'b' (1×1) sits beside the 2-row 'a' — merging b down is fine, but
    // merging b RIGHT into c then down would misalign against a: check the
    // guard on a itself — merging a right now (2 rows vs 1) is refused.
    expect(canMerge(a, 'right')).toBe(false);
    mergeCells(ctx, a, 'right'); // no-op
    expect(a.getAttribute('colspan')).toBeNull();
  });

  it('splitCell restores empty cells across the freed slots', () => {
    const { ctx, table } = makeCtx(GRID_3X3);
    const a = table.rows[0].cells[0];
    mergeCells(ctx, a, 'right');
    mergeCells(ctx, a, 'down'); // 2×2 block
    expect(canSplit(a)).toBe(true);
    splitCell(ctx, a);
    expect(a.getAttribute('colspan')).toBeNull();
    expect(a.getAttribute('rowspan')).toBeNull();
    const grid = tableGrid(table);
    expect(grid).toHaveLength(3);
    expect(grid.every((r) => r.length === 3 && r.every(Boolean))).toBe(true);
    expect(table.rows[0].cells).toHaveLength(3);
    expect(table.rows[1].cells).toHaveLength(3);
  });
});

describe('spreadsheet clipboard', () => {
  it('parseTsv splits rows and cells; rejects non-tabular text', () => {
    expect(parseTsv('a\tb\r\nc\td\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseTsv('just a sentence')).toBeNull();
  });

  it('parseClipboardTable reads a pasted HTML table', () => {
    expect(
      parseClipboardTable('<meta><table><tr><td>x</td><td>y</td></tr></table>'),
    ).toEqual([['x', 'y']]);
    expect(parseClipboardTable('<p>no table</p>')).toBeNull();
  });

  it('pasteFillCells fills right/down and grows rows to fit', () => {
    const { ctx, table } = makeCtx(GRID_3X3);
    const e = table.rows[1].cells[1]; // center
    expect(pasteFillCells(ctx, e, '1\t2\n3\t4\n5\t6')).toBe(true);
    expect(table.rows[1].cells[1].textContent).toBe('1');
    expect(table.rows[1].cells[2].textContent).toBe('2');
    expect(table.rows[2].cells[1].textContent).toBe('3');
    // Grew one row for the third data row.
    expect(table.rows).toHaveLength(4);
    expect(table.rows[3].cells[1].textContent).toBe('5');
    // Single-value text is not grid-shaped — normal paste handles it.
    expect(pasteFillCells(ctx, e, 'plain')).toBe(false);
  });
});

describe('merge with a thead present', () => {
  it('two widened rows align for a downward merge', () => {
    const { ctx, table } = makeCtx(
      '<table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>' +
        '<tbody><tr><td>1</td><td>2</td><td>3</td></tr>' +
        '<tr><td>4</td><td>5</td><td>6</td></tr>' +
        '<tr><td>7</td><td>8</td><td>9</td></tr></tbody></table>',
    );
    const cell = (r: number, c: number) => table.tBodies[0].rows[r].cells[c];
    mergeCells(ctx, cell(0, 0), 'right');
    expect(cell(0, 0).getAttribute('colspan')).toBe('2');
    expect(canMerge(cell(0, 0), 'down')).toBe(false); // widths differ
    mergeCells(ctx, cell(1, 0), 'right');
    expect(canMerge(cell(0, 0), 'down')).toBe(true); // now aligned
    mergeCells(ctx, cell(0, 0), 'down');
    expect(cell(0, 0).getAttribute('rowspan')).toBe('2');
  });
});
