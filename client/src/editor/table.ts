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

/* ---------- merged cells (colspan/rowspan) ---------- */

/**
 * The logical grid: grid[r][c] = the cell COVERING that slot (a spanning
 * cell repeats across its slots). The foundation every merge/split/width
 * operation reasons over — DOM cell indices lie once spans exist.
 */
export function tableGrid(table: HTMLTableElement): HTMLTableCellElement[][] {
  const grid: HTMLTableCellElement[][] = [];
  rowsOf(table).forEach((tr, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of Array.from(tr.cells)) {
      while (grid[r][c]) c++;
      for (let dr = 0; dr < cell.rowSpan; dr++) {
        for (let dc = 0; dc < cell.colSpan; dc++) {
          (grid[r + dr] ??= [])[c + dc] = cell;
        }
      }
      c += cell.colSpan;
    }
  });
  return grid;
}

/** A cell's slot rectangle in the logical grid (inclusive bounds). */
function gridRectOf(
  grid: HTMLTableCellElement[][],
  cell: HTMLTableCellElement,
): { r0: number; c0: number; r1: number; c1: number } | null {
  let r0 = Infinity;
  let c0 = Infinity;
  let r1 = -1;
  let c1 = -1;
  grid.forEach((row, r) =>
    row.forEach((covering, c) => {
      if (covering !== cell) return;
      r0 = Math.min(r0, r);
      c0 = Math.min(c0, c);
      r1 = Math.max(r1, r);
      c1 = Math.max(c1, c);
    }),
  );
  return r1 < 0 ? null : { r0, c0, r1, c1 };
}

/** The neighbor a merge would absorb — only when both rects line up exactly
 *  (anything else would knock the grid out of rectangle). */
function mergeTarget(
  cell: HTMLTableCellElement,
  dir: 'right' | 'down',
): HTMLTableCellElement | null {
  const table = asTable(cell.closest('table'));
  if (!table) return null;
  const grid = tableGrid(table);
  const rect = gridRectOf(grid, cell);
  if (!rect) return null;
  const neighbor =
    dir === 'right' ? grid[rect.r0]?.[rect.c1 + 1] : grid[rect.r1 + 1]?.[rect.c0];
  if (!neighbor || neighbor === cell) return null;
  // Merging across the thead/tbody boundary would strand a row in two
  // sections — disallow.
  if (neighbor.parentElement?.parentElement !== cell.parentElement?.parentElement) return null;
  const nRect = gridRectOf(grid, neighbor)!;
  const aligned =
    dir === 'right'
      ? nRect.r0 === rect.r0 && nRect.r1 === rect.r1 && nRect.c0 === rect.c1 + 1
      : nRect.c0 === rect.c0 && nRect.c1 === rect.c1 && nRect.r0 === rect.r1 + 1;
  return aligned ? neighbor : null;
}

export function canMerge(cell: HTMLTableCellElement, dir: 'right' | 'down'): boolean {
  return mergeTarget(cell, dir) !== null;
}

/** Absorb the aligned neighbor: its content appends, the span grows. */
export function mergeCells(ctx: StageCtx, cell: HTMLTableCellElement, dir: 'right' | 'down'): void {
  const neighbor = mergeTarget(cell, dir);
  if (!neighbor) return;
  // Keep both contents (PowerPoint behavior); separate with a space.
  if (neighbor.textContent?.trim()) {
    if (cell.textContent?.trim()) cell.append(' ');
    while (neighbor.firstChild) cell.appendChild(neighbor.firstChild);
  }
  const setSpan = (attr: 'colspan' | 'rowspan', n: number) => {
    if (n > 1) cell.setAttribute(attr, String(n));
    else cell.removeAttribute(attr);
  };
  if (dir === 'right') setSpan('colspan', cell.colSpan + neighbor.colSpan);
  else setSpan('rowspan', cell.rowSpan + neighbor.rowSpan);
  neighbor.remove();
  commit(ctx);
}

export function canSplit(cell: HTMLTableCellElement): boolean {
  return cell.colSpan > 1 || cell.rowSpan > 1;
}

/** Split a merged cell back to 1×1, restoring empty cells in the freed slots. */
export function splitCell(ctx: StageCtx, cell: HTMLTableCellElement): void {
  const table = asTable(cell.closest('table'));
  if (!table || !canSplit(cell)) return;
  const grid = tableGrid(table); // BEFORE resetting the spans
  const rect = gridRectOf(grid, cell);
  if (!rect) return;
  cell.removeAttribute('colspan');
  cell.removeAttribute('rowspan');
  const doc = table.ownerDocument;
  const rows = rowsOf(table);
  for (let r = rect.r0; r <= rect.r1; r++) {
    const tr = rows[r];
    const tag = tr.parentElement?.tagName === 'THEAD' ? 'th' : 'td';
    // Insert before the first cell of this row that starts right of the
    // freed slots (grid-truth, not DOM index).
    const before =
      Array.from(tr.cells).find((c) => {
        const cr = gridRectOf(grid, c);
        return !!cr && cr.c0 > rect.c1;
      }) ?? null;
    const count = r === rect.r0 ? rect.c1 - rect.c0 : rect.c1 - rect.c0 + 1;
    for (let i = 0; i < count; i++) tr.insertBefore(doc.createElement(tag), before);
  }
  commit(ctx);
}

/* ---------- column widths ---------- */

/**
 * The table's <colgroup>, created from MEASURED column widths (as %) the
 * first time widths are edited. Locks `table-layout: fixed` + the current
 * px width so the % widths become authoritative instead of hints the auto
 * layout may overrule. Plain HTML/CSS — round-trips and presents anywhere.
 */
export function ensureColgroup(table: HTMLTableElement): HTMLTableColElement[] {
  const doc = table.ownerDocument;
  const grid = tableGrid(table);
  const width = grid[0]?.length ?? 0;
  let cg = table.querySelector(':scope > colgroup');
  if (!cg || cg.children.length !== width) {
    cg?.remove();
    cg = doc.createElement('colgroup');
    const tRect = table.getBoundingClientRect();
    const colW: number[] = new Array(width).fill(0);
    for (let c = 0; c < width; c++) {
      // Measure from any cell occupying exactly this one column.
      const single = grid
        .map((row) => row[c])
        .find((cell, r) => {
          const row = grid[r];
          return cell && row[c - 1] !== cell && row[c + 1] !== cell;
        });
      colW[c] = single ? single.getBoundingClientRect().width : tRect.width / width;
    }
    const total = colW.reduce((a, b) => a + b, 0) || 1;
    for (let c = 0; c < width; c++) {
      const col = doc.createElement('col');
      col.style.width = `${Math.round((colW[c] / total) * 1000) / 10}%`;
      cg.appendChild(col);
    }
    table.insertBefore(cg, table.firstElementChild);
    if (!table.style.width) table.style.width = `${Math.round(tRect.width)}px`;
    table.style.tableLayout = 'fixed';
  }
  return Array.from(cg.children) as HTMLTableColElement[];
}

/** Shift the boundary between columns i and i+1 by deltaPct (of table
 *  width). NO commit — the drag gesture commits on release. */
export function resizeColumnPair(
  cols: HTMLTableColElement[],
  index: number,
  startWidths: number[],
  deltaPct: number,
): void {
  const pair = startWidths[index] + startWidths[index + 1];
  const a = Math.min(Math.max(startWidths[index] + deltaPct, 4), pair - 4);
  cols[index].style.width = `${Math.round(a * 10) / 10}%`;
  cols[index + 1].style.width = `${Math.round((pair - a) * 10) / 10}%`;
}

/* ---------- spreadsheet clipboard ---------- */

/** Rows × cells from clipboard TSV (Excel/Sheets plain-text flavor). */
export function parseTsv(text: string): string[][] | null {
  const rows = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  if (rows.length === 0 || !rows.some((r) => r.includes('\t'))) return null;
  return rows.map((r) => r.split('\t'));
}

/** Rows × cells from a clipboard HTML fragment containing a <table>
 *  (Excel/Sheets rich flavor). Text content only — office markup is soup. */
export function parseClipboardTable(html: string): string[][] | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const grid = Array.from(table.rows).map((tr) =>
    Array.from(tr.cells).map((c) => c.textContent?.trim() ?? ''),
  );
  return grid.length > 0 && grid.some((r) => r.some((c) => c)) ? grid : null;
}

/** Build and insert a fresh table from clipboard data. */
export function insertTableFromData(
  ctx: StageCtx,
  after: HTMLElement | null,
  data: string[][],
): HTMLElement | null {
  ensureTablePresetCss();
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cols = Math.max(...data.map((r) => r.length));
  const row = (cells: string[], tag: 'th' | 'td') =>
    `<tr>${Array.from({ length: cols }, (_, i) => `<${tag}>${esc(cells[i] ?? '')}</${tag}>`).join('')}</tr>`;
  const [head, ...body] = data;
  const html = `<table class="re-table re-table--bordered">
  <thead>
    ${row(head, 'th')}
  </thead>
  <tbody>
    ${body.map((r) => row(r, 'td')).join('\n    ')}
  </tbody>
</table>`;
  return insertHtmlSnippet(ctx, html, after);
}

/**
 * Fill cells right/down from `startCell` with pasted spreadsheet data,
 * appending body rows when the data runs past the bottom (columns are NOT
 * extended — width is layout, data is data). Returns false when the text
 * isn't grid-shaped (single cell → let normal paste handle it).
 */
export function pasteFillCells(
  ctx: StageCtx,
  startCell: HTMLTableCellElement,
  text: string,
): boolean {
  const data = parseTsv(text);
  if (!data || (data.length === 1 && data[0].length === 1)) return false;
  const table = asTable(startCell.closest('table'));
  if (!table) return false;
  let grid = tableGrid(table);
  const rect = gridRectOf(grid, startCell);
  if (!rect) return false;
  const doc = table.ownerDocument;
  const width = grid[0]?.length ?? 0;
  for (let dr = 0; dr < data.length; dr++) {
    if (rect.r0 + dr >= grid.length) {
      // Grow the body to fit the pasted rows.
      const tr = doc.createElement('tr');
      for (let i = 0; i < width; i++) tr.appendChild(doc.createElement('td'));
      tbodyOf(table).appendChild(tr);
      grid = tableGrid(table);
    }
    for (let dc = 0; dc < data[dr].length; dc++) {
      const target = grid[rect.r0 + dr]?.[rect.c0 + dc];
      if (target) target.textContent = data[dr][dc];
    }
  }
  commit(ctx);
  return true;
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
