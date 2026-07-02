import { describe, it, expect, beforeEach } from 'vitest';
import type { StageCtx } from './commands';
import {
  addColumn,
  addRow,
  allCells,
  deleteColumn,
  deleteRow,
  hasHeaderRow,
  nextCell,
  setColumnAlignment,
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
