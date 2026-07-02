/**
 * Table editing: structural operations on plain <table> markup (the HTML is
 * the editable source — principle #5), plus style presets backed by the
 * editor-managed style block so decks stay standalone.
 *
 * V1 assumes a uniform grid (no colspan/rowspan merges — T2).
 */
import type { StageCtx } from './commands';
import { commit, insertHtmlSnippet } from './commands';
import { useDeckStore } from '../state/deckStore';

export const TABLE_PRESETS = ['bordered', 'striped', 'minimal'] as const;
export type TablePreset = (typeof TABLE_PRESETS)[number];

const PRESET_MARKER = '/* re:tables */';
const PRESET_CSS = `${PRESET_MARKER}
.re-table { border-collapse: collapse; margin: 0 auto; }
.re-table th, .re-table td { padding: 0.35em 0.7em; }
.re-table--bordered th, .re-table--bordered td { border: 1px solid currentColor; }
.re-table--striped tbody tr:nth-child(odd) { background: rgba(128, 128, 128, 0.18); }
.re-table--minimal th, .re-table--minimal td { border: none; }
.re-table--minimal thead th { border-bottom: 2px solid currentColor; }`;

/** Make sure the deck's managed style block carries the table preset rules. */
export function ensureTablePresetCss(): void {
  const store = useDeckStore.getState();
  if (!store.meta || store.meta.managedCss.includes(PRESET_MARKER)) return;
  const existing = store.meta.managedCss.trim();
  store.setManagedCss(existing ? `${existing}\n\n${PRESET_CSS}` : PRESET_CSS);
}

export function insertTable(
  ctx: StageCtx,
  after: HTMLElement | null,
  rows = 3,
  cols = 3,
  withHeader = true,
): HTMLElement | null {
  ensureTablePresetCss();
  const headerCells = Array.from({ length: cols }, (_, i) => `<th>Column ${i + 1}</th>`).join('');
  const bodyRow = `<tr>${'<td></td>'.repeat(cols)}</tr>`;
  const bodyRows = Array.from({ length: rows }, () => bodyRow).join('\n    ');
  const html = `<table class="re-table re-table--bordered">
  ${withHeader ? `<thead>\n    <tr>${headerCells}</tr>\n  </thead>\n  ` : ''}<tbody>
    ${bodyRows}
  </tbody>
</table>`;
  return insertHtmlSnippet(ctx, html, after);
}

export function tablePreset(table: HTMLElement): TablePreset | null {
  for (const p of TABLE_PRESETS) {
    if (table.classList.contains(`re-table--${p}`)) return p;
  }
  return null;
}

export function setTablePreset(ctx: StageCtx, table: HTMLElement, preset: TablePreset | null): void {
  for (const p of TABLE_PRESETS) table.classList.remove(`re-table--${p}`);
  if (preset) {
    ensureTablePresetCss();
    table.classList.add('re-table');
    table.classList.add(`re-table--${preset}`);
  }
  if (table.getAttribute('class') === '') table.removeAttribute('class');
  commit(ctx);
}

/* ---------- grid helpers ---------- */

// NEVER use `instanceof HTMLTableElement` here: stage elements live in the
// iframe's realm, whose element classes are different objects — instanceof
// against the parent window's classes silently fails.
function asTable(el: Element | null): HTMLTableElement | null {
  return el && el.tagName === 'TABLE' ? (el as HTMLTableElement) : null;
}

function rowsOf(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.rows);
}

export function cellCount(table: HTMLTableElement): number {
  return rowsOf(table)[0]?.cells.length ?? 0;
}

/** All cells in reading order — Tab navigation order. */
export function allCells(table: HTMLTableElement): HTMLTableCellElement[] {
  return rowsOf(table).flatMap((r) => Array.from(r.cells));
}

export function nextCell(cell: HTMLTableCellElement, dir: 1 | -1): HTMLTableCellElement | null {
  const table = cell.closest('table');
  if (!table) return null;
  const cells = allCells(table as HTMLTableElement);
  const idx = cells.indexOf(cell);
  return cells[idx + dir] ?? null;
}

function tbodyOf(table: HTMLTableElement): HTMLTableSectionElement {
  let tbody = table.tBodies[0];
  if (!tbody) {
    tbody = table.ownerDocument.createElement('tbody');
    table.appendChild(tbody);
  }
  return tbody;
}

/* ---------- structural operations ---------- */

export function addRow(ctx: StageCtx, refCell: HTMLTableCellElement, where: 'above' | 'below'): void {
  const table = asTable(refCell.closest('table')!);
  if (!table) return;
  const refRow = refCell.parentElement as HTMLTableRowElement;
  const cols = Math.max(refRow.cells.length, cellCount(table));
  const doc = table.ownerDocument;
  const tr = doc.createElement('tr');
  for (let i = 0; i < cols; i++) tr.appendChild(doc.createElement('td'));

  // New data rows always live in tbody; relative to a header row they land
  // at the top of the body.
  if (refRow.parentElement?.tagName === 'THEAD') {
    const tbody = tbodyOf(table);
    tbody.insertBefore(tr, tbody.firstElementChild);
  } else if (where === 'above') {
    refRow.before(tr);
  } else {
    refRow.after(tr);
  }
  commit(ctx);
}

export function deleteRow(ctx: StageCtx, refCell: HTMLTableCellElement): void {
  const table = asTable(refCell.closest('table')!);
  if (!table || rowsOf(table).length <= 1) return;
  const row = refCell.parentElement as HTMLTableRowElement;
  const parent = row.parentElement;
  row.remove();
  // Drop an emptied thead/tbody wrapper.
  if (parent && parent.tagName !== 'TABLE' && parent.children.length === 0) parent.remove();
  commit(ctx);
}

export function addColumn(ctx: StageCtx, refCell: HTMLTableCellElement, where: 'left' | 'right'): void {
  const table = asTable(refCell.closest('table')!);
  if (!table) return;
  const idx = refCell.cellIndex + (where === 'right' ? 1 : 0);
  const doc = table.ownerDocument;
  for (const row of rowsOf(table)) {
    const tag = row.parentElement?.tagName === 'THEAD' ? 'th' : 'td';
    const cell = doc.createElement(tag);
    row.insertBefore(cell, row.cells[idx] ?? null);
  }
  commit(ctx);
}

export function deleteColumn(ctx: StageCtx, refCell: HTMLTableCellElement): void {
  const table = asTable(refCell.closest('table')!);
  if (!table || cellCount(table) <= 1) return;
  const idx = refCell.cellIndex;
  for (const row of rowsOf(table)) row.cells[idx]?.remove();
  commit(ctx);
}

export function hasHeaderRow(table: HTMLTableElement): boolean {
  return table.tHead !== null && table.tHead.rows.length > 0;
}

export function toggleHeaderRow(ctx: StageCtx, table: HTMLTableElement): void {
  const doc = table.ownerDocument;
  if (hasHeaderRow(table)) {
    // thead rows → td rows at the top of tbody.
    const tbody = tbodyOf(table);
    const headRows = Array.from(table.tHead!.rows).reverse();
    for (const row of headRows) {
      for (const cell of Array.from(row.cells)) renameCell(doc, cell, 'td');
      tbody.insertBefore(row, tbody.firstElementChild);
    }
    table.tHead!.remove();
  } else {
    const firstRow = rowsOf(table)[0];
    if (!firstRow) return;
    for (const cell of Array.from(firstRow.cells)) renameCell(doc, cell, 'th');
    const thead = doc.createElement('thead');
    thead.appendChild(firstRow);
    table.insertBefore(thead, table.firstElementChild);
    const tbody = table.tBodies[0];
    if (tbody && tbody.rows.length === 0) tbody.remove();
  }
  commit(ctx);
}

function renameCell(doc: Document, cell: HTMLTableCellElement, tag: 'td' | 'th'): void {
  if (cell.tagName.toLowerCase() === tag) return;
  const repl = doc.createElement(tag);
  for (const attr of cell.attributes) repl.setAttribute(attr.name, attr.value);
  while (cell.firstChild) repl.appendChild(cell.firstChild);
  cell.replaceWith(repl);
}

export function setColumnAlignment(
  ctx: StageCtx,
  refCell: HTMLTableCellElement,
  align: 'left' | 'center' | 'right' | null,
): void {
  const table = asTable(refCell.closest('table')!);
  if (!table) return;
  const idx = refCell.cellIndex;
  for (const row of rowsOf(table)) {
    const cell = row.cells[idx];
    if (!cell) continue;
    if (align) cell.style.textAlign = align;
    else cell.style.removeProperty('text-align');
    if (cell.getAttribute('style') === '') cell.removeAttribute('style');
  }
  commit(ctx);
}
